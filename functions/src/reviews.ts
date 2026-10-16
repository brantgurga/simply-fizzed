// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

/* oxlint-disable oxc/no-map-spread -- Queue projections intentionally return immutable copies. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- Firestore boundary values are guarded immediately before narrowing. */

import { createHash } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { ServiceError, type AuthGateway, type AuthUser } from "./management.js";

export const REVIEW_CONTENT_LIMIT = 2_000;
export const REVIEW_MARKDOWN_LIMIT = 3_000;
const REPORT_CATEGORIES = new Set([
  "off-topic-spam",
  "copyright",
  "offensive",
  "security-safety",
  "other",
]);
const UNSUPPORTED_DELIMITERS = new Set(["`", "|", "[", "]", "~"]);
const AUTHOR_FIELDS = [
  "authorId",
  "authorName",
  "sodaOfferingId",
  "sodaName",
  "sodaBrand",
  "sodaFlavor",
  "markdown",
  "contentLength",
  "version",
  "authoredAt",
  "baseModerationCycle",
  "baseApprovedVersion",
  "mutationId",
] as const;

export interface ReportReviewInput {
  authorId: string;
  sodaOfferingId: string;
  version: number;
  category: string;
  explanation?: string;
}
export interface ModerateReviewInput {
  authorId: string;
  sodaOfferingId: string;
  expectedVersion: number;
  expectedCycle: number;
  expectedQueueVersion: number | null;
  decision: "allow" | "hide";
  explanation?: string;
}

export function reviewKey(authorId: string, sodaOfferingId: string): string {
  return createHash("sha256").update(authorId).update("\0").update(sodaOfferingId).digest("hex");
}

/** Identify one immutable author/soda revision independently of client mutation IDs. */
export function reviewVersionKey(
  authorId: string,
  sodaOfferingId: string,
  version: number,
): string {
  return createHash("sha256")
    .update(authorId)
    .update("\0")
    .update(sodaOfferingId)
    .update("\0")
    .update(version.toString())
    .digest("hex");
}

/** Resolve author revisions conservatively across offline moderation races. */
export function revisionDisposition(
  previousStatus: unknown,
  moderationCycle: number,
  authorBaseCycle: number,
  approvedVersion: number | null = null,
  authorBaseApprovedVersion: number | null = null,
): "visible" | "pending" {
  return previousStatus === "pending" ||
    previousStatus === "hidden" ||
    authorBaseCycle !== moderationCycle ||
    authorBaseApprovedVersion !== approvedVersion
    ? "pending"
    : "visible";
}

/** Security/Safety dominates one cycle; otherwise revised work is lower priority. */
export function moderationQueueKind(
  category: string | undefined,
  priorSecuritySafety: boolean,
  revised: boolean,
): "security" | "reported" | "revised" {
  if (category === "security-safety" || priorSecuritySafety) return "security";
  return revised ? "revised" : "reported";
}

interface ModerationDecisionState {
  authorId: unknown;
  sodaOfferingId: unknown;
  version: unknown;
  cycle: number;
  status: unknown;
  queue:
    | {
        authorId: unknown;
        sodaOfferingId: unknown;
        latestVersion: unknown;
        cycle: unknown;
        queueVersion: unknown;
      }
    | undefined;
}

/** Match a decision to one exact review/cycle/queue snapshot. */
export function moderationDecisionMatches(
  state: ModerationDecisionState,
  input: ModerateReviewInput,
): boolean {
  if (
    state.authorId !== input.authorId ||
    state.sodaOfferingId !== input.sodaOfferingId ||
    state.version !== input.expectedVersion ||
    state.cycle !== input.expectedCycle
  ) {
    return false;
  }
  if (state.status === "pending") {
    const queue = state.queue;
    return (
      input.expectedQueueVersion !== null &&
      queue !== undefined &&
      queue.authorId === input.authorId &&
      queue.sodaOfferingId === input.sodaOfferingId &&
      queue.latestVersion === input.expectedVersion &&
      queue.cycle === input.expectedCycle &&
      queue.queueVersion === input.expectedQueueVersion
    );
  }
  return (
    input.decision === "hide" &&
    state.status === "visible" &&
    input.expectedQueueVersion === null &&
    state.queue === undefined
  );
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && value.trim() === "")) {
    throw new ServiceError("invalid-argument", "Review data is malformed.");
  }
  return value;
}

function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ServiceError("invalid-argument", "Review version data is malformed.");
  }
  return value as number;
}

function mutationId(value: unknown): string {
  const id = text(value, 100);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    throw new ServiceError("invalid-argument", "Review mutation identity is malformed.");
  }
  return id;
}

function isAuthNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  return code === "auth/user-not-found" || code === "user-not-found";
}

/** Resolve an enabled caller from current Firebase Auth state, not cached token claims. */
export async function resolveCurrentActor(
  auth: Pick<AuthGateway, "getUser">,
  uid: string | undefined,
): Promise<AuthUser> {
  if (uid === undefined) throw new ServiceError("unauthenticated", "Sign in is required.");
  let actor: AuthUser;
  try {
    actor = await auth.getUser(uid);
  } catch (error) {
    if (isAuthNotFound(error)) {
      throw new ServiceError("unauthenticated", "The signed-in account is unavailable.");
    }
    throw error;
  }
  if (actor.disabled) {
    throw new ServiceError("permission-denied", "The signed-in account is disabled.");
  }
  return actor;
}

/** Require a current authoritative Moderator claim. */
export async function requireCurrentModerator(
  auth: Pick<AuthGateway, "getUser">,
  uid: string | undefined,
): Promise<AuthUser> {
  const actor = await resolveCurrentActor(auth, uid);
  if (actor.customClaims?.["moderator"] !== true) {
    throw new ServiceError("permission-denied", "Moderator authority is required.");
  }
  return actor;
}

function reviewPlainText(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}#{1,6}(?:\s+|$)/gm, "")
    .replace(/^\s*(?:[-+*]|\d+\.)(?:\s+|$)/gm, "")
    .replace(/\*\*|__|[*_]/g, "")
    .replace(/\\([\\`|[\]>*_#.!+~)=-])/g, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function hasUnescapedUnsupportedDelimiter(markdown: string): boolean {
  let precedingBackslashes = 0;
  for (const character of markdown) {
    if (character === "\\") {
      precedingBackslashes += 1;
      continue;
    }
    if (UNSUPPORTED_DELIMITERS.has(character) && precedingBackslashes % 2 === 0) {
      return true;
    }
    precedingBackslashes = 0;
  }
  return false;
}

/** Validate the persisted canonical subset independently from the browser. */
export function validateReviewMarkdown(markdown: unknown, claimedLength: unknown): string | null {
  if (markdown === null) {
    if (claimedLength !== 0) {
      throw new ServiceError("invalid-argument", "Empty review length is invalid.");
    }
    return null;
  }
  const value = text(markdown, REVIEW_MARKDOWN_LIMIT);
  if (
    hasUnescapedUnsupportedDelimiter(value) ||
    /<(?:\/?[A-Za-z]|[!?])/.test(value) ||
    /^\s*>|^(?: {4}|\t)|^\s{0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,}|=+)\s*$|^\s*\d+\)\s+/m.test(
      value,
    )
  ) {
    throw new ServiceError("invalid-argument", "Unsupported review formatting was supplied.");
  }
  const plain = reviewPlainText(value);
  const length = Array.from(plain).length;
  if (length === 0 || length > REVIEW_CONTENT_LIMIT || claimedLength !== length) {
    throw new ServiceError("invalid-argument", "Review content length is invalid.");
  }
  return value;
}

function authorSnapshot(data: DocumentData): DocumentData {
  return Object.fromEntries(AUTHOR_FIELDS.map((field) => [field, data[field]]));
}

function publicProjection(
  data: DocumentData,
  rating: number,
  moderationCycle: number,
  publishedAt: Timestamp,
  revisedAt: Timestamp | null,
): DocumentData {
  return {
    authorId: data["authorId"],
    authorName: data["authorName"],
    sodaOfferingId: data["sodaOfferingId"],
    sodaName: data["sodaName"],
    sodaBrand: data["sodaBrand"],
    sodaFlavor: data["sodaFlavor"],
    markdown: data["markdown"],
    contentLength: data["contentLength"],
    rating,
    version: data["version"],
    moderationCycle,
    publishedAt,
    revisedAt,
  };
}

function currentReference(db: Firestore, authorId: string, sodaId: string) {
  return db.collection("profiles").doc(authorId).collection("reviews").doc(sodaId);
}

/** Idempotently audit and project one author write. */
export async function processReviewWrite(
  db: Firestore,
  authorId: string,
  sodaId: string,
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined,
): Promise<void> {
  if (before?.exists && after?.exists && before.get("version") === after.get("version")) {
    return;
  }
  const key = reviewKey(authorId, sodaId);
  const publicReference = db.collection("publishedReviews").doc(key);
  const queueReference = db.collection("reviewModerationQueue").doc(key);
  if (after === undefined || !after.exists) {
    await Promise.all([publicReference.delete(), queueReference.delete()]);
    return;
  }

  const eventData = after.data() ?? {};
  const eventMutationId = mutationId(eventData["mutationId"]);
  const version = integer(eventData["version"], 1);
  const auditReference = db
    .collection("reviewAudit")
    .doc(key)
    .collection("versions")
    .doc(reviewVersionKey(authorId, sodaId, version));
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const profileReference = db.collection("profiles").doc(authorId);
    const reference = currentReference(db, authorId, sodaId);
    const ratingReference = profileReference.collection("ratings").doc(sodaId);
    const [profile, current, rating, queue, existingAudit] = await Promise.all([
      transaction.get(profileReference),
      transaction.get(reference),
      transaction.get(ratingReference),
      transaction.get(queueReference),
      transaction.get(auditReference),
    ]);
    // The first transaction records the immutable revision and reconciles projections
    // atomically. A retried delivery must not reinterpret stale event snapshots after a
    // report or moderation decision has changed the current review at the same version.
    if (existingAudit.exists) return;
    transaction.create(auditReference, {
      type: "review.revised",
      actorId: authorId,
      version,
      occurredAt: now,
      review: authorSnapshot(eventData),
      supersedesVersion: before?.exists ? before.get("version") : null,
    });
    if (
      !current.exists ||
      current.get("version") !== version ||
      current.get("mutationId") !== eventMutationId
    ) {
      return;
    }

    let markdown: string | null;
    try {
      markdown = validateReviewMarkdown(current.get("markdown"), current.get("contentLength"));
    } catch {
      transaction.update(reference, {
        moderationStatus: "hidden",
        moderationCycle: integer(current.get("moderationCycle") ?? 0) + 1,
        approvedVersion: null,
        hiddenReason: "The review exceeds a length limit or contains unsupported formatting.",
        moderatedAt: now,
      });
      transaction.delete(publicReference);
      transaction.delete(queueReference);
      return;
    }

    if (markdown === null) {
      transaction.update(reference, {
        moderationStatus: "none",
        approvedVersion: null,
        publicationVersion: null,
        publishedAt: null,
        hiddenReason: null,
        moderatedAt: now,
      });
      transaction.delete(publicReference);
      transaction.delete(queueReference);
      return;
    }
    const pointRating = rating.get("rating");
    if (typeof pointRating !== "number" || pointRating < 1 || pointRating > 5) {
      transaction.update(reference, {
        moderationStatus: "hidden",
        approvedVersion: null,
        hiddenReason: "A point rating is required for a textual review.",
        moderatedAt: now,
      });
      transaction.delete(publicReference);
      transaction.delete(queueReference);
      return;
    }
    const authorName = profile.get("publicName");
    const sodaName = rating.get("sodaName");
    const sodaBrand = rating.get("sodaBrand");
    const sodaFlavor = rating.get("sodaFlavor");
    if (
      typeof authorName !== "string" ||
      authorName.length > 320 ||
      (authorName.length > 0 && authorName.trim().length === 0) ||
      typeof sodaName !== "string" ||
      sodaName.trim().length === 0 ||
      sodaName.length > 200 ||
      typeof sodaBrand !== "string" ||
      sodaBrand.trim().length === 0 ||
      sodaBrand.length > 200 ||
      typeof sodaFlavor !== "string" ||
      sodaFlavor.trim().length === 0 ||
      sodaFlavor.length > 200
    ) {
      transaction.update(reference, {
        moderationStatus: "hidden",
        approvedVersion: null,
        hiddenReason: "The review's public attribution data is unavailable.",
        moderatedAt: now,
      });
      transaction.delete(publicReference);
      transaction.delete(queueReference);
      return;
    }
    const canonicalData = {
      ...current.data(),
      authorId,
      authorName,
      sodaOfferingId: sodaId,
      sodaName,
      sodaBrand,
      sodaFlavor,
    };
    const canonicalFields = { authorName, sodaName, sodaBrand, sodaFlavor };

    const hadPreviousText = before?.get("markdown") != null;
    const oldStatus = hadPreviousText ? (before?.get("moderationStatus") ?? "none") : "none";
    const cycle = integer(before?.get("moderationCycle") ?? 0);
    const baseCycle = integer(current.get("baseModerationCycle") ?? 0);
    const approvedVersion =
      hadPreviousText && typeof before?.get("approvedVersion") === "number"
        ? integer(before.get("approvedVersion"), 1)
        : null;
    const baseApprovedVersion =
      typeof current.get("baseApprovedVersion") === "number"
        ? integer(current.get("baseApprovedVersion"), 1)
        : null;
    const disposition = revisionDisposition(
      oldStatus,
      cycle,
      baseCycle,
      approvedVersion,
      baseApprovedVersion,
    );
    if (disposition === "pending") {
      const sameQueueCycle = queue.exists && queue.get("cycle") === cycle;
      const securitySafety = sameQueueCycle && queue.get("securitySafety") === true;
      const priorCategories = queue.get("categories");
      const reportedVersion = queue.get("reportedVersion");
      const queueVersion = sameQueueCycle ? integer(queue.get("queueVersion"), 1) + 1 : 1;
      transaction.update(reference, {
        ...canonicalFields,
        moderationStatus: "pending",
        moderationCycle: cycle,
        approvedVersion: null,
        moderatedAt: now,
      });
      transaction.delete(publicReference);
      transaction.set(queueReference, {
        authorId,
        sodaOfferingId: sodaId,
        latestVersion: version,
        cycle,
        queueVersion,
        queueKind: moderationQueueKind(undefined, securitySafety, true),
        priorityRank: securitySafety ? 1 : 3,
        securitySafety,
        revisedSinceReport: true,
        pendingSince: sameQueueCycle ? (queue.get("pendingSince") ?? now) : now,
        updatedAt: now,
        ...(sameQueueCycle && Array.isArray(priorCategories)
          ? { categories: priorCategories }
          : {}),
        ...(sameQueueCycle && typeof reportedVersion === "number" ? { reportedVersion } : {}),
      });
      return;
    }

    const startsPublication =
      before?.get("markdown") == null || !(before?.get("publishedAt") instanceof Timestamp);
    const publishedAt = startsPublication ? now : (before?.get("publishedAt") as Timestamp);
    const publicationVersion = startsPublication
      ? version
      : integer(before?.get("publicationVersion") ?? 1, 1);
    transaction.update(reference, {
      ...canonicalFields,
      moderationStatus: "visible",
      moderationCycle: cycle,
      approvedVersion: version,
      publicationVersion,
      publishedAt,
      hiddenReason: null,
      moderatedAt: now,
    });
    transaction.set(
      publicReference,
      publicProjection(
        canonicalData,
        pointRating,
        cycle,
        publishedAt,
        startsPublication ? null : now,
      ),
    );
    transaction.delete(queueReference);
  });
}

/** Keep the public review's independent point rating current without changing chronology. */
export async function syncPublishedReviewRating(
  db: Firestore,
  authorId: string,
  sodaId: string,
  rating: unknown,
): Promise<void> {
  const reference = db.collection("publishedReviews").doc(reviewKey(authorId, sodaId));
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    await reference.delete();
    return;
  }
  const snapshot = await reference.get();
  if (snapshot.exists) await reference.update({ rating });
}

/** Trusted online report and moderation operations. */
export class ReviewModerationService {
  readonly #db: Firestore;
  readonly #auth: Pick<AuthGateway, "getUser">;

  constructor(db: Firestore, auth: Pick<AuthGateway, "getUser">) {
    this.#db = db;
    this.#auth = auth;
  }

  async report(actorId: string | undefined, input: ReportReviewInput): Promise<{ cycle: number }> {
    const actor = await resolveCurrentActor(this.#auth, actorId);
    const authorId = text(input?.authorId, 1_500);
    const sodaId = text(input?.sodaOfferingId, 1_500);
    if (actor.uid === authorId) {
      throw new ServiceError("permission-denied", "Authors cannot report their own review.");
    }
    const version = integer(input?.version, 1);
    const category = text(input?.category, 50);
    if (!REPORT_CATEGORIES.has(category)) {
      throw new ServiceError("invalid-argument", "Select a report category.");
    }
    const explanation =
      input.explanation === undefined ? "" : text(input.explanation, 1_000, true).trim();
    if (category === "other" && explanation.length === 0) {
      throw new ServiceError("invalid-argument", "Other reports require an explanation.");
    }

    const key = reviewKey(authorId, sodaId);
    const reportReference = this.#db.collection("reviewAudit").doc(key).collection("reports").doc();
    const queueReference = this.#db.collection("reviewModerationQueue").doc(key);
    const publicReference = this.#db.collection("publishedReviews").doc(key);
    const reference = currentReference(this.#db, authorId, sodaId);
    const restrictionReference = this.#db.collection("restrictions").doc(actor.uid);
    return await this.#db.runTransaction(async (transaction) => {
      const [current, published, queue, restriction] = await Promise.all([
        transaction.get(reference),
        transaction.get(publicReference),
        transaction.get(queueReference),
        transaction.get(restrictionReference),
      ]);
      const restrictionExpiration = restriction.get("expiresAt");
      const activeRestriction =
        restriction.exists &&
        (!(restrictionExpiration instanceof Timestamp) ||
          restrictionExpiration.toMillis() > Date.now());
      if (activeRestriction) {
        throw new ServiceError("permission-denied", "Reporting is unavailable while restricted.");
      }
      if (
        !current.exists ||
        current.get("version") !== version ||
        current.get("markdown") == null
      ) {
        throw new ServiceError(
          "failed-precondition",
          "This review changed. Reload it before reporting.",
        );
      }
      const status = current.get("moderationStatus");
      const currentCycle = integer(current.get("moderationCycle") ?? 0);
      const continuingCycle =
        status === "pending" &&
        queue.exists &&
        queue.get("reportedVersion") === version &&
        queue.get("latestVersion") === version &&
        queue.get("cycle") === currentCycle;
      if (status !== "visible" && !continuingCycle) {
        throw new ServiceError(
          "failed-precondition",
          "This review is no longer publicly reportable.",
        );
      }
      if (status === "visible" && (!published.exists || published.get("version") !== version)) {
        throw new ServiceError(
          "failed-precondition",
          "This review is no longer publicly reportable.",
        );
      }
      const cycle = status === "visible" ? currentCycle + 1 : currentCycle;
      const securitySafety =
        category === "security-safety" || (continuingCycle && queue.get("securitySafety") === true);
      const queueVersion = continuingCycle ? integer(queue.get("queueVersion"), 1) + 1 : 1;
      transaction.create(reportReference, {
        reporterId: actor.uid,
        category,
        explanation,
        reviewVersion: version,
        cycle,
        reportedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reference, {
        moderationStatus: "pending",
        moderationCycle: cycle,
        approvedVersion: null,
        moderatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        queueReference,
        {
          authorId,
          sodaOfferingId: sodaId,
          reportedVersion: continuingCycle ? queue.get("reportedVersion") : version,
          latestVersion: version,
          cycle,
          queueVersion,
          categories: continuingCycle ? FieldValue.arrayUnion(category) : [category],
          securitySafety,
          queueKind: moderationQueueKind(
            category,
            continuingCycle && queue.get("securitySafety") === true,
            false,
          ),
          priorityRank: securitySafety ? 1 : 2,
          revisedSinceReport: false,
          pendingSince: continuingCycle
            ? (queue.get("pendingSince") ?? FieldValue.serverTimestamp())
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: continuingCycle },
      );
      transaction.delete(publicReference);
      return { cycle };
    });
  }

  async moderate(moderatorId: string | undefined, input: ModerateReviewInput): Promise<void> {
    const moderator = await requireCurrentModerator(this.#auth, moderatorId);
    const authorId = text(input?.authorId, 1_500);
    const sodaId = text(input?.sodaOfferingId, 1_500);
    const expectedVersion = integer(input?.expectedVersion, 1);
    const expectedCycle = integer(input?.expectedCycle);
    const expectedQueueVersion =
      input?.expectedQueueVersion === null ? null : integer(input?.expectedQueueVersion, 1);
    if (input?.decision !== "allow" && input?.decision !== "hide") {
      throw new ServiceError("invalid-argument", "Select a moderation decision.");
    }
    const explanation =
      input.explanation === undefined ? "" : text(input.explanation, 1_000, true).trim();
    if (input.decision === "hide" && explanation.length === 0) {
      throw new ServiceError("invalid-argument", "Hiding requires an author-visible reason.");
    }

    const key = reviewKey(authorId, sodaId);
    const reference = currentReference(this.#db, authorId, sodaId);
    const ratingReference = this.#db
      .collection("profiles")
      .doc(authorId)
      .collection("ratings")
      .doc(sodaId);
    const publicReference = this.#db.collection("publishedReviews").doc(key);
    const queueReference = this.#db.collection("reviewModerationQueue").doc(key);
    const decisionReference = this.#db
      .collection("reviewAudit")
      .doc(key)
      .collection("decisions")
      .doc();
    await this.#db.runTransaction(async (transaction) => {
      const [current, rating, queue] = await Promise.all([
        transaction.get(reference),
        transaction.get(ratingReference),
        transaction.get(queueReference),
      ]);
      if (!current.exists) {
        throw new ServiceError(
          "failed-precondition",
          "The review changed. Reload before deciding.",
        );
      }
      const currentCycle = integer(current.get("moderationCycle") ?? 0);
      const decisionMatches = moderationDecisionMatches(
        {
          authorId: current.get("authorId"),
          sodaOfferingId: current.get("sodaOfferingId"),
          version: current.get("version"),
          cycle: currentCycle,
          status: current.get("moderationStatus"),
          queue: queue.exists
            ? {
                authorId: queue.get("authorId"),
                sodaOfferingId: queue.get("sodaOfferingId"),
                latestVersion: queue.get("latestVersion"),
                cycle: queue.get("cycle"),
                queueVersion: queue.get("queueVersion"),
              }
            : undefined,
        },
        { ...input, expectedCycle, expectedQueueVersion },
      );
      if (!decisionMatches) {
        throw new ServiceError(
          "failed-precondition",
          "The moderation cycle changed. Reload before deciding.",
        );
      }
      const pointRating = rating.get("rating");
      if (
        current.get("markdown") == null ||
        typeof pointRating !== "number" ||
        pointRating < 1 ||
        pointRating > 5
      ) {
        throw new ServiceError("failed-precondition", "The review is no longer eligible.");
      }
      const now = Timestamp.now();
      const cycle = integer(current.get("moderationCycle") ?? 0);
      transaction.create(decisionReference, {
        moderatorId: moderator.uid,
        decision: input.decision,
        explanation,
        reviewVersion: expectedVersion,
        cycle,
        decidedAt: now,
      });
      if (input.decision === "allow") {
        const startsPublication = !(current.get("publishedAt") instanceof Timestamp);
        const publishedAt = startsPublication ? now : (current.get("publishedAt") as Timestamp);
        const publicationVersion = startsPublication
          ? expectedVersion
          : integer(current.get("publicationVersion") ?? 1, 1);
        transaction.update(reference, {
          moderationStatus: "visible",
          approvedVersion: expectedVersion,
          publicationVersion,
          publishedAt,
          hiddenReason: null,
          moderatedAt: now,
        });
        transaction.set(
          publicReference,
          publicProjection(
            current.data() ?? {},
            pointRating,
            currentCycle,
            publishedAt,
            expectedVersion === publicationVersion ? null : now,
          ),
        );
      } else {
        transaction.update(reference, {
          moderationStatus: "hidden",
          approvedVersion: null,
          hiddenReason: explanation,
          moderatedAt: now,
        });
        transaction.delete(publicReference);
      }
      transaction.delete(queueReference);
    });
  }

  async list(
    moderatorId: string | undefined,
    kind: "security" | "reported" | "revised",
    revealSecurity = false,
    page = 0,
  ): Promise<{ items: DocumentData[]; hasMore: boolean }> {
    await requireCurrentModerator(this.#auth, moderatorId);
    if (!new Set(["security", "reported", "revised"]).has(kind)) {
      throw new ServiceError("invalid-argument", "Unknown moderation queue.");
    }
    integer(page);
    if (page > 100) {
      throw new ServiceError("invalid-argument", "Moderation page is out of range.");
    }
    const snapshot = await this.#db
      .collection("reviewModerationQueue")
      .where("queueKind", "==", kind)
      .orderBy("pendingSince", "asc")
      .limit((page + 1) * 5 + 1)
      .get();
    const pageDocuments = snapshot.docs.slice(page * 5, page * 5 + 5);
    const items = await Promise.all(
      pageDocuments.map(async (queue) => {
        const authorId = text(queue.get("authorId"), 1_500);
        const sodaId = text(queue.get("sodaOfferingId"), 1_500);
        const key = queue.id;
        const [current, versions, reports, decisions] = await Promise.all([
          currentReference(this.#db, authorId, sodaId).get(),
          this.#db
            .collection("reviewAudit")
            .doc(key)
            .collection("versions")
            .orderBy("occurredAt", "asc")
            .get(),
          this.#db
            .collection("reviewAudit")
            .doc(key)
            .collection("reports")
            .orderBy("reportedAt", "asc")
            .get(),
          this.#db
            .collection("reviewAudit")
            .doc(key)
            .collection("decisions")
            .orderBy("decidedAt", "asc")
            .get(),
        ]);
        const protectedContent = kind === "security" && !revealSecurity;
        return {
          ...queue.data(),
          id: key,
          current: {
            ...current.data(),
            markdown: protectedContent ? null : current.get("markdown"),
            protectedContent,
          },
          history: {
            versions: versions.docs.map((item) => {
              const data = item.data();
              const review =
                typeof data["review"] === "object" && data["review"] !== null
                  ? (data["review"] as DocumentData)
                  : {};
              return {
                ...data,
                review: protectedContent ? { ...review, markdown: "[protected]" } : review,
              };
            }),
            reports: reports.docs.map((item) => item.data()),
            decisions: decisions.docs.map((item) => item.data()),
          },
        };
      }),
    );
    return { items, hasMore: snapshot.docs.length > (page + 1) * 5 };
  }
}
