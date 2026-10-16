// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  Timestamp,
  where,
  type Firestore,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import {
  COLLECTIONS,
  currentReviewDocumentSchema,
  publishedReviewDocumentSchema,
  type CurrentReviewDocument,
  type PublishedReviewDocument,
} from "../model/firestore";
import type { SodaDocument } from "../soda/sodas";
import { prepareReviewMarkdown } from "./markdownFormat";

export const REVIEW_PAGE_SIZE = 5;
export const REPORT_CATEGORIES = [
  "off-topic-spam",
  "copyright",
  "offensive",
  "security-safety",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface CurrentReviewRecord extends CurrentReviewDocument {
  id: string;
}
export interface PublishedReviewRecord extends PublishedReviewDocument {
  id: string;
  sodaUnavailable?: boolean;
}
export type CurrentReviewLoad =
  | { status: "found"; value: CurrentReviewRecord }
  | { status: "missing" }
  | { status: "malformed" };
export interface ReviewPage {
  reviews: PublishedReviewRecord[];
  next?: { publishedAt: Date; id: string };
}

export function parseCurrentReview(id: string, value: unknown): CurrentReviewRecord | undefined {
  const parsed = currentReviewDocumentSchema.safeParse(value);
  return parsed.success ? { id, ...parsed.data } : undefined;
}

export function parsePublishedReview(
  id: string,
  value: unknown,
): PublishedReviewRecord | undefined {
  const parsed = publishedReviewDocumentSchema.safeParse(value);
  return parsed.success ? { id, ...parsed.data } : undefined;
}

/** Load the author's current review, including actionable moderation state. */
export async function loadCurrentReview(
  database: Firestore,
  authorId: string,
  sodaId: string,
): Promise<CurrentReviewLoad> {
  const snapshot = await getDoc(
    doc(database, COLLECTIONS.profiles, authorId, COLLECTIONS.reviews, sodaId),
  );
  if (!snapshot.exists()) return { status: "missing" };
  const review = parseCurrentReview(snapshot.id, snapshot.data());
  return review === undefined ? { status: "malformed" } : { status: "found", value: review };
}

/** Queue an offline-capable author revision; trusted processing publishes and audits it. */
export async function saveCurrentReview(
  database: Firestore,
  author: { id: string; name: string },
  soda: SodaDocument,
  input: string,
  current?: CurrentReviewRecord,
): Promise<{ markdown: string | null; version: number }> {
  const prepared = prepareReviewMarkdown(input);
  const reference = doc(database, COLLECTIONS.profiles, author.id, COLLECTIONS.reviews, soda.id);
  const version = (current?.version ?? 0) + 1;
  const revisionFields = {
    markdown: prepared.markdown,
    contentLength: prepared.contentLength,
    version,
    authoredAt: Timestamp.now(),
    baseModerationCycle: current?.moderationCycle ?? 0,
    baseApprovedVersion: current?.approvedVersion ?? null,
    mutationId: crypto.randomUUID(),
  };
  if (current === undefined) {
    await setDoc(reference, {
      authorId: author.id,
      authorName: author.name,
      sodaOfferingId: soda.id,
      sodaName: soda.name,
      sodaBrand: soda.brand,
      sodaFlavor: soda.flavor,
      ...revisionFields,
    });
  } else {
    await setDoc(reference, revisionFields, { merge: true });
  }
  return { markdown: prepared.markdown, version };
}

async function loadReviewPage(
  database: Firestore,
  field: "sodaOfferingId" | "authorId",
  value: string,
  cursor?: ReviewPage["next"],
): Promise<ReviewPage> {
  const constraints: QueryConstraint[] = [
    where(field, "==", value),
    orderBy("publishedAt", "desc"),
    orderBy(documentId(), "asc"),
  ];
  if (cursor !== undefined) {
    constraints.push(startAfter(Timestamp.fromDate(cursor.publishedAt), cursor.id));
  }
  constraints.push(limit(REVIEW_PAGE_SIZE + 1));
  const snapshot = await getDocs(
    query(collection(database, COLLECTIONS.publishedReviews), ...constraints),
  );
  const parsed = snapshot.docs.map((item) => parsePublishedReview(item.id, item.data()));
  if (parsed.some((item) => item === undefined)) throw new Error("Malformed published review.");
  const all = parsed.filter((item): item is PublishedReviewRecord => item !== undefined);
  const reviews = all.slice(0, REVIEW_PAGE_SIZE);
  const last = reviews.at(-1);
  return {
    reviews,
    ...(all.length > REVIEW_PAGE_SIZE && last !== undefined
      ? { next: { publishedAt: last.publishedAt, id: last.id } }
      : {}),
  };
}

/** Load newest public reviews for one stable soda identity. */
export const loadSodaReviews = (database: Firestore, sodaId: string, cursor?: ReviewPage["next"]) =>
  loadReviewPage(database, "sodaOfferingId", sodaId, cursor);

/** Load newest public reviews authored by one profile, retaining dangling soda subjects. */
export async function loadProfileReviews(
  database: Firestore,
  authorId: string,
  cursor?: ReviewPage["next"],
): Promise<ReviewPage> {
  const page = await loadReviewPage(database, "authorId", authorId, cursor);
  const reviews = await Promise.all(
    page.reviews.map(async (review) => {
      const soda = await getDoc(doc(database, COLLECTIONS.sodas, review.sodaOfferingId));
      return soda.exists() ? review : { ...review, sodaUnavailable: true };
    }),
  );
  return { ...page, reviews };
}

/** Submit an online, server-versioned report. */
export async function reportReview(input: {
  authorId: string;
  sodaOfferingId: string;
  version: number;
  category: ReportCategory;
  explanation?: string;
}): Promise<void> {
  const callable = httpsCallable<typeof input, { cycle: number }>(functions, "reportReview");
  await callable(input);
}

/** Apply an online, version-aware moderation decision without rewriting review text. */
export async function moderateReview(input: {
  authorId: string;
  sodaOfferingId: string;
  expectedVersion: number;
  expectedCycle: number;
  expectedQueueVersion: number | null;
  decision: "allow" | "hide";
  explanation?: string;
}): Promise<void> {
  const callable = httpsCallable<typeof input, void>(functions, "moderateReview");
  await callable(input);
}

export interface ReviewAttentionItem {
  id: string;
  sodaOfferingId: string;
  sodaBrand: string;
  sodaName: string;
  moderationStatus: "pending" | "hidden";
  hiddenReason?: string | null;
}

/** Observe distinct reviews that need the signed-in author's attention. */
export function observeReviewAttention(
  database: Firestore,
  authorId: string,
  listener: (items: ReviewAttentionItem[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(database, COLLECTIONS.profiles, authorId, COLLECTIONS.reviews),
      where("moderationStatus", "in", ["pending", "hidden"]),
    ),
    (snapshot) => {
      listener(
        snapshot.docs.flatMap((item) => {
          const review = parseCurrentReview(item.id, item.data());
          if (
            review === undefined ||
            (review.moderationStatus !== "pending" && review.moderationStatus !== "hidden")
          ) {
            return [];
          }
          return [
            {
              id: item.id,
              sodaOfferingId: review.sodaOfferingId,
              sodaBrand: review.sodaBrand,
              sodaName: review.sodaName,
              moderationStatus: review.moderationStatus,
              ...(review.hiddenReason === undefined ? {} : { hiddenReason: review.hiddenReason }),
            },
          ];
        }),
      );
    },
    () => listener([]),
  );
}
