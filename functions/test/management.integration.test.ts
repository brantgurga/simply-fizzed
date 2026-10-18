// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { randomUUID } from "node:crypto";
import { expect } from "expect";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth } from "firebase-admin/auth";
import {
  getFirestore as getAdminFirestore,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, type User } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";
import { FirestoreUserAuditStore } from "../src/firestore-audit-store.js";
import { processReviewWrite, reviewKey, syncPublishedReviewRating } from "../src/reviews.js";

const PROJECT_ID = "demo-simply-fizzed";
const PASSWORD = "emulator-password";
const REGION = "us-central1";

const accounts = {
  operator: { uid: "operator-uid", email: "operator@example.com", displayName: "Opal Operator" },
  moderator: {
    uid: "moderator-uid",
    email: "moderator@example.com",
    displayName: "Morgan Moderator",
  },
  restrictedModerator: {
    uid: "restricted-moderator-uid",
    email: "restricted-moderator@example.com",
    displayName: "Riley Restricted",
  },
  fan: { uid: "fan-uid", email: "fan.person@example.com", displayName: "Fiona Fan" },
  secondFan: {
    uid: "second-fan-uid",
    email: "second.fan@example.com",
    displayName: "Finn Fan",
  },
} as const;

const accountNames = [
  "operator",
  "moderator",
  "restrictedModerator",
  "fan",
  "secondFan",
] as const satisfies readonly (keyof typeof accounts)[];
type AccountName = (typeof accountNames)[number];
interface Client {
  app: FirebaseApp;
  functions: Functions;
  user: User;
}

let adminAuth: Auth;
let adminDb: Firestore;
const clients = new Map<AccountName, Client>();
const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, "management-integration-admin");

async function createClient(name: AccountName): Promise<Client> {
  const account = accounts[name];
  const app = initializeApp(
    { apiKey: "demo-api-key", projectId: PROJECT_ID },
    `management-integration-${name}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const credential = await signInWithEmailAndPassword(auth, account.email, PASSWORD);
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return { app, functions, user: credential.user };
}

async function call<T>(name: AccountName, functionName: string, data: unknown = {}): Promise<T> {
  const client = clients.get(name);
  if (client === undefined) throw new Error(`Missing client ${name}`);
  let request = data;
  if (
    functionName === "applyUserManagement" &&
    typeof data === "object" &&
    data !== null &&
    typeof Reflect.get(data, "targetUid") === "string"
  ) {
    const targetUid: unknown = Reflect.get(data, "targetUid");
    if (typeof targetUid !== "string") throw new Error("Invalid integration target UID.");
    const state = await adminDb.collection("userAuditState").doc(targetUid).get();
    request = {
      expectedVersion: state.get("version") ?? 0,
      reason: "Integration test administrative action",
      ...data,
    };
  }
  const callable = httpsCallable<unknown, T>(client.functions, functionName);
  return (await callable(request)).data;
}

async function waitForReview(
  authorId: string,
  sodaId: string,
  predicate: (current: DocumentSnapshot, published: DocumentSnapshot) => boolean,
): Promise<void> {
  const key = reviewKey(authorId, sodaId);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each poll must observe fresh emulator state.
    const [current, published] = await Promise.all([
      adminDb.collection("profiles").doc(authorId).collection("reviews").doc(sodaId).get(),
      adminDb.collection("publishedReviews").doc(key).get(),
    ]);
    if (predicate(current, published)) return;
    // oxlint-disable-next-line eslint/no-await-in-loop -- Delay before the next sequential poll.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for review processing.");
}

async function seedVisibleReview(sodaId: string): Promise<DocumentSnapshot> {
  const authorId = accounts.fan.uid;
  const review = {
    authorId,
    authorName: accounts.fan.displayName,
    sodaOfferingId: sodaId,
    sodaName: "Integration Cola",
    sodaBrand: "Test Brand",
    sodaFlavor: "Original",
    markdown: "A useful integration review.",
    contentLength: 28,
    version: 1,
    authoredAt: new Date(),
    baseModerationCycle: 0,
    baseApprovedVersion: null,
    mutationId: randomUUID(),
  };
  await Promise.all([
    adminDb
      .collection("profiles")
      .doc(authorId)
      .set({ publicName: accounts.fan.displayName }, { merge: true }),
    adminDb.collection("profiles").doc(authorId).collection("ratings").doc(sodaId).set({
      userId: authorId,
      sodaOfferingId: sodaId,
      sodaName: review.sodaName,
      sodaBrand: review.sodaBrand,
      sodaFlavor: review.sodaFlavor,
      rating: 4,
      firstRecorded: new Date(),
      lastRatedAt: new Date(),
    }),
    adminDb.collection("reviewIntegrationEvents").doc(sodaId).set(review),
  ]);
  await adminDb.collection("profiles").doc(authorId).collection("reviews").doc(sodaId).set(review);
  await waitForReview(
    authorId,
    sodaId,
    (current, published) => current.get("moderationStatus") === "visible" && published.exists,
  );
  return await adminDb.collection("reviewIntegrationEvents").doc(sodaId).get();
}

before(async () => {
  adminAuth = getAdminAuth(adminApp);
  adminDb = getAdminFirestore(adminApp);
  await Promise.all(
    Object.values(accounts).map(
      async (account) =>
        await adminAuth.createUser({
          uid: account.uid,
          email: account.email,
          displayName: account.displayName,
          password: PASSWORD,
        }),
    ),
  );
  await Promise.all([
    adminAuth.setCustomUserClaims(accounts.moderator.uid, { moderator: true }),
    adminAuth.setCustomUserClaims(accounts.restrictedModerator.uid, { moderator: true }),
    adminAuth.setCustomUserClaims(accounts.secondFan.uid, { unrelated: "preserve-me" }),
    adminDb
      .collection("restrictions")
      .doc(accounts.restrictedModerator.uid)
      .set({
        publicReason: "Temporary community pause",
        originallyRestrictedBy: accounts.operator.uid,
        originallyRestrictedAt: new Date("2026-10-03T00:00:00.000Z"),
        restrictionLastUpdatedBy: accounts.operator.uid,
        restrictionLastUpdatedAt: new Date("2026-10-03T00:00:00.000Z"),
      }),
    adminDb
      .collection("restrictions")
      .doc(accounts.operator.uid)
      .set({
        publicReason: "Operator community pause",
        originallyRestrictedBy: accounts.operator.uid,
        originallyRestrictedAt: new Date("2026-10-03T00:00:00.000Z"),
        restrictionLastUpdatedBy: accounts.operator.uid,
        restrictionLastUpdatedAt: new Date("2026-10-03T00:00:00.000Z"),
      }),
  ]);
  const createdClients = await Promise.all(
    accountNames.map(async (name) => [name, await createClient(name)] as const),
  );
  for (const [name, client] of createdClients) clients.set(name, client);
});

after(async () => {
  await Promise.all([...clients.values()].map(async (client) => await deleteApp(client.app)));
  await deleteAdminApp(adminApp);
});

describe("callable authorization boundary", () => {
  it("uses trusted caller context and rejects Fan role assertions", async () => {
    await expect(call("fan", "getMyAuthorization")).resolves.toMatchObject({
      moderator: false,
      operator: false,
      restricted: false,
      canWriteCommunity: true,
      canManageUsers: false,
    });
    await expect(
      call("fan", "searchUsers", {
        mode: "uid",
        query: accounts.secondFan.uid,
        callerUid: accounts.operator.uid,
        operator: true,
      }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("lets an unrestricted Moderator find users while marking peers unmanageable", async () => {
    const fans = await call<Array<Record<string, unknown>>>("moderator", "searchUsers", {
      mode: "displayName",
      query: "Fan",
    });
    expect(fans).toHaveLength(2);
    expect(fans.map((result) => result["uid"])).toEqual(
      expect.arrayContaining([accounts.fan.uid, accounts.secondFan.uid]),
    );
    expect(fans[0]).not.toHaveProperty("email");
    expect(fans[0]?.["obfuscatedEmail"]).toMatch(/…@example\.com$/);

    await expect(
      call<unknown[]>("moderator", "searchUsers", {
        mode: "uid",
        query: accounts.restrictedModerator.uid,
      }),
    ).resolves.toMatchObject([{ uid: accounts.restrictedModerator.uid, canManage: false }]);
    await expect(
      call("moderator", "applyUserManagement", {
        targetUid: accounts.restrictedModerator.uid,
        restriction: null,
      }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("lets a Moderator inspect but not manage a configured Operator", async () => {
    await expect(
      call<unknown[]>("moderator", "searchUsers", {
        mode: "uid",
        query: accounts.operator.uid,
      }),
    ).resolves.toMatchObject([{ uid: accounts.operator.uid, canManage: false }]);
    await expect(
      call("moderator", "revealUserEmail", { targetUid: accounts.operator.uid }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(
      call("moderator", "applyUserManagement", {
        targetUid: accounts.operator.uid,
        restriction: { publicReason: "Unauthorized restriction" },
      }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("requires an explicit authorized call to reveal a full email", async () => {
    await expect(
      call("moderator", "revealUserEmail", { targetUid: accounts.fan.uid }),
    ).resolves.toEqual({ email: accounts.fan.email });
    const moderationDocuments = await adminDb.collection("userModeration").get();
    expect(moderationDocuments.docs.some((item) => JSON.stringify(item.data()).includes("@"))).toBe(
      false,
    );
  });

  it("suppresses a restricted Moderator but preserves restricted Operator authority", async () => {
    await expect(call("restrictedModerator", "getMyAuthorization")).resolves.toMatchObject({
      moderator: true,
      operator: false,
      restricted: true,
      canManageUsers: false,
    });
    await expect(
      call("restrictedModerator", "searchUsers", {
        mode: "uid",
        query: accounts.fan.uid,
      }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(call("operator", "getMyAuthorization")).resolves.toMatchObject({
      operator: true,
      restricted: true,
      canWriteCommunity: false,
      canManageUsers: true,
    });
  });

  it("lets a restricted Operator remove their own restriction", async () => {
    await expect(
      call("operator", "applyUserManagement", {
        targetUid: accounts.operator.uid,
        restriction: null,
      }),
    ).resolves.toMatchObject({ uid: accounts.operator.uid, restriction: null });
    await expect(call("operator", "getMyAuthorization")).resolves.toMatchObject({
      operator: true,
      restricted: false,
      canManageUsers: true,
    });
  });

  it("keeps unresolved configured Operators from invalidating a valid Operator", async () => {
    await expect(
      call<unknown[]>("operator", "searchUsers", {
        mode: "uid",
        query: accounts.moderator.uid,
      }),
    ).resolves.toMatchObject([{ uid: accounts.moderator.uid, moderator: true }]);
  });

  it("never grants authority from stale supplementary Moderator metadata", async () => {
    await adminDb.collection("userModeration").doc(accounts.fan.uid).set({
      moderatorGrantedBy: accounts.operator.uid,
      moderatorGrantedAt: new Date(),
      moderatorGrantOperationId: "stale-test-grant",
    });

    await expect(call("fan", "getMyAuthorization")).resolves.toMatchObject({
      moderator: false,
      canManageUsers: false,
    });
    await expect(
      call("fan", "searchUsers", { mode: "uid", query: accounts.secondFan.uid }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    await adminDb.collection("userModeration").doc(accounts.fan.uid).delete();
  });

  it("validates a combined Save before granting authoritative capability", async () => {
    await expect(
      call("operator", "applyUserManagement", {
        targetUid: accounts.fan.uid,
        moderator: true,
        restriction: {
          publicReason: "Invalid combined request",
          expiresAt: "2000-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ code: "functions/invalid-argument" });

    const unchanged = await adminAuth.getUser(accounts.fan.uid);
    expect(unchanged.customClaims?.["moderator"]).not.toBe(true);
    const metadata = await adminDb.collection("userModeration").doc(accounts.fan.uid).get();
    expect(metadata.get("moderatorGrantedBy")).toBeUndefined();
  });

  it("grants a restricted Fan and revokes Moderator with claims authoritative over metadata", async () => {
    await call("operator", "applyUserManagement", {
      targetUid: accounts.secondFan.uid,
      restriction: { publicReason: "Temporary restricted grant test" },
    });
    await expect(
      call("operator", "applyUserManagement", {
        targetUid: accounts.secondFan.uid,
        moderator: true,
      }),
    ).resolves.toMatchObject({
      uid: accounts.secondFan.uid,
      moderator: true,
      restriction: { publicReason: "Temporary restricted grant test" },
    });
    const granted = await adminAuth.getUser(accounts.secondFan.uid);
    expect(granted.customClaims).toMatchObject({ unrelated: "preserve-me", moderator: true });
    await expect(
      adminDb.collection("userModeration").doc(accounts.secondFan.uid).get(),
    ).resolves.toMatchObject({ exists: true });

    await expect(
      call("operator", "applyUserManagement", {
        targetUid: accounts.secondFan.uid,
        moderator: false,
      }),
    ).resolves.toMatchObject({ uid: accounts.secondFan.uid, moderator: false });
    const revoked = await adminAuth.getUser(accounts.secondFan.uid);
    expect(revoked.customClaims).toEqual({ unrelated: "preserve-me" });
    const metadata = await adminDb.collection("userModeration").doc(accounts.secondFan.uid).get();
    expect(metadata.get("moderatorGrantedBy")).toBeUndefined();
    await call("operator", "applyUserManagement", {
      targetUid: accounts.secondFan.uid,
      restriction: null,
    });
  });

  it("rejects stale Moderator tokens immediately after authoritative revocation", async () => {
    await call("operator", "applyUserManagement", {
      targetUid: accounts.moderator.uid,
      moderator: false,
    });
    await expect(
      call("moderator", "searchUsers", { mode: "uid", query: accounts.fan.uid }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    await call("operator", "applyUserManagement", {
      targetUid: accounts.moderator.uid,
      moderator: true,
    });
  });

  it("preserves original restriction attribution across edits and clears current metadata", async () => {
    const first = await call<Record<string, unknown>>("moderator", "applyUserManagement", {
      targetUid: accounts.fan.uid,
      restriction: {
        publicReason: "Please pause inaccurate additions",
        internalReason: "Two invalid locations",
      },
    });
    const firstRestriction = first["restriction"];
    if (typeof firstRestriction !== "object" || firstRestriction === null) {
      throw new Error("Expected a confirmed restriction");
    }
    const originalAt = Reflect.get(firstRestriction, "originallyRestrictedAt");

    const edited = await call<Record<string, unknown>>("moderator", "applyUserManagement", {
      targetUid: accounts.fan.uid,
      restriction: {
        publicReason: "Please verify sources before contributing",
        internalReason: "Correction supplied",
      },
    });
    expect(edited).toMatchObject({
      restriction: {
        publicReason: "Please verify sources before contributing",
        internalReason: "Correction supplied",
        originallyRestrictedAt: originalAt,
      },
    });

    await expect(
      call("moderator", "applyUserManagement", {
        targetUid: accounts.fan.uid,
        restriction: null,
      }),
    ).resolves.toMatchObject({ restriction: null });
    await expect(
      adminDb.collection("restrictions").doc(accounts.fan.uid).get(),
    ).resolves.toMatchObject({ exists: false });
  });

  it("records system-authored account creation and one self-service profile event", async () => {
    const initial = await call<Record<string, unknown>>("operator", "getUserAuditHistory", {
      targetUid: accounts.fan.uid,
    });
    const initialEvents: unknown = initial["events"];
    const initialVersion: unknown = initial["version"];
    if (!Array.isArray(initialEvents) || typeof initialVersion !== "number") {
      throw new Error("Expected initial audit history.");
    }
    const accountEvent = initialEvents.find(
      (event) =>
        typeof event === "object" &&
        event !== null &&
        Reflect.get(event, "type") === "account.created",
    );
    expect(accountEvent).toMatchObject({
      actor: { kind: "system", id: "firebase-auth" },
      subjectUid: accounts.fan.uid,
      type: "account.created",
      sequence: 1,
      before: null,
    });

    await call("fan", "saveMyProfile", { publicName: "Fiona Public" });
    await call("fan", "saveMyProfile", { publicName: "Fiona Public" });
    const updated = await call<Record<string, unknown>>("moderator", "getUserAuditHistory", {
      targetUid: accounts.fan.uid,
    });
    expect(updated["version"]).toBe(initialVersion + 1);
    const updatedEvents: unknown = updated["events"];
    if (!Array.isArray(updatedEvents)) throw new Error("Expected audit events.");
    expect(updatedEvents[0]).toMatchObject({
      actor: { kind: "user", uid: accounts.fan.uid },
      subjectUid: accounts.fan.uid,
      type: "profile.updated",
      sequence: initialVersion + 1,
    });
    expect(updatedEvents).toHaveLength(initialEvents.length + 1);
  });

  it("rejects stale concurrent moderation and records exactly one winning event", async () => {
    const state = await adminDb.collection("userAuditState").doc(accounts.fan.uid).get();
    const expectedVersion: unknown = state.get("version");
    if (typeof expectedVersion !== "number") throw new Error("Expected an audit version.");
    const first = call("moderator", "applyUserManagement", {
      targetUid: accounts.fan.uid,
      expectedVersion,
      reason: "Concurrent action one",
      restriction: { publicReason: "First concurrent restriction" },
    });
    const second = call("moderator", "applyUserManagement", {
      targetUid: accounts.fan.uid,
      expectedVersion,
      reason: "Concurrent action two",
      restriction: { publicReason: "Second concurrent restriction" },
    });
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const events = await adminDb
      .collection("userAudit")
      .doc(accounts.fan.uid)
      .collection("events")
      .where("sequence", "==", expectedVersion + 1)
      .get();
    expect(events.size).toBe(1);
    await call("moderator", "applyUserManagement", {
      targetUid: accounts.fan.uid,
      restriction: null,
    });
  });

  it("audits disablement and re-enablement with required reasons", async () => {
    await call("operator", "applyUserManagement", {
      targetUid: accounts.secondFan.uid,
      reason: "Emergency abuse response",
      disabled: true,
    });
    expect((await adminAuth.getUser(accounts.secondFan.uid)).disabled).toBe(true);
    await call("operator", "applyUserManagement", {
      targetUid: accounts.secondFan.uid,
      reason: "Appeal accepted",
      disabled: false,
    });
    expect((await adminAuth.getUser(accounts.secondFan.uid)).disabled).toBe(false);

    const history = await call<Record<string, unknown>>("operator", "getUserAuditHistory", {
      targetUid: accounts.secondFan.uid,
    });
    const events: unknown = history["events"];
    if (!Array.isArray(events)) throw new Error("Expected audit events.");
    expect(events.slice(0, 2)).toMatchObject([
      { type: "user.enabled", reason: "Appeal accepted" },
      { type: "user.disabled", reason: "Emergency abuse response" },
    ]);
  });

  it("uses current authority for history and denies a Moderator their own history", async () => {
    await expect(
      call("moderator", "getUserAuditHistory", { targetUid: accounts.moderator.uid }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(
      call("operator", "getUserAuditHistory", { targetUid: accounts.operator.uid }),
    ).resolves.toMatchObject({ events: expect.any(Array) });
    await expect(
      call("fan", "getUserAuditHistory", { targetUid: accounts.operator.uid }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("rejects an unauthenticated direct callable request", async () => {
    const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/searchUsers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { mode: "uid", query: accounts.fan.uid } }),
    });

    expect(response.status).toBe(401);
  });
});

describe("background function retry safety", () => {
  it("records one account-created audit event when creation is delivered twice", async () => {
    const subjectUid = "duplicate-account-creation";
    const store = new FirestoreUserAuditStore(adminDb);
    const event = {
      id: `account-created:${subjectUid}`,
      actor: { kind: "system" as const, id: "firebase-auth" as const },
      subjectUid,
      type: "account.created" as const,
      before: null,
      after: {
        auth: {
          disabled: false,
          displayName: "Duplicate Account",
          email: "duplicate@example.com",
          hasProfileImage: false,
          moderator: false,
        },
        profile: null,
        restriction: null,
      },
      changedFields: ["auth"],
    };

    await Promise.all([
      store.appendInitialEvent(event, new Date("2026-10-18T00:00:00.000Z")),
      store.appendInitialEvent(event, new Date("2026-10-18T00:00:00.000Z")),
    ]);

    const [state, events] = await Promise.all([
      adminDb.collection("userAuditState").doc(subjectUid).get(),
      adminDb.collection("userAudit").doc(subjectUid).collection("events").get(),
    ]);
    expect(state.get("version")).toBe(1);
    expect(events.docs.map((item) => item.id)).toEqual([event.id]);
  });

  it("does not republish pending content when a revision is delivered twice", async () => {
    const sodaId = "dup000000001";
    const originalEvent = await seedVisibleReview(sodaId);
    await call("secondFan", "reportReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      version: 1,
      category: "offensive",
    });

    await processReviewWrite(adminDb, accounts.fan.uid, sodaId, undefined, originalEvent);

    const key = reviewKey(accounts.fan.uid, sodaId);
    const [current, published, queue, versions] = await Promise.all([
      adminDb.collection("profiles").doc(accounts.fan.uid).collection("reviews").doc(sodaId).get(),
      adminDb.collection("publishedReviews").doc(key).get(),
      adminDb.collection("reviewModerationQueue").doc(key).get(),
      adminDb.collection("reviewAudit").doc(key).collection("versions").get(),
    ]);
    expect(current.get("moderationStatus")).toBe("pending");
    expect(published.exists).toBe(false);
    expect(queue.exists).toBe(true);
    expect(versions.size).toBe(1);
  });

  it("ignores a retried deletion after the author recreates the review", async () => {
    const sodaId = "retry-delete";
    await seedVisibleReview(sodaId);
    const reference = adminDb
      .collection("profiles")
      .doc(accounts.fan.uid)
      .collection("reviews")
      .doc(sodaId);
    const deletedReview = await reference.get();
    await reference.delete();
    await waitForReview(accounts.fan.uid, sodaId, (current, published) => {
      return !current.exists && !published.exists;
    });
    await reference.set({
      ...deletedReview.data(),
      version: 2,
      mutationId: randomUUID(),
      authoredAt: new Date(),
    });
    await waitForReview(accounts.fan.uid, sodaId, (current, published) => {
      return current.get("version") === 2 && published.exists;
    });

    await processReviewWrite(adminDb, accounts.fan.uid, sodaId, deletedReview, undefined);

    const published = await adminDb
      .collection("publishedReviews")
      .doc(reviewKey(accounts.fan.uid, sodaId))
      .get();
    expect(published.exists).toBe(true);
    expect(published.get("version")).toBe(2);
  });
});

describe("review moderation concurrency", () => {
  it("retains a concurrent Security/Safety report instead of applying a stale allow", async () => {
    const sodaId = "race00000001";
    await seedVisibleReview(sodaId);
    const first = await call<{ cycle: number }>("secondFan", "reportReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      version: 1,
      category: "offensive",
    });
    const key = reviewKey(accounts.fan.uid, sodaId);
    const queue = await adminDb.collection("reviewModerationQueue").doc(key).get();

    const results = await Promise.allSettled([
      call("secondFan", "reportReview", {
        authorId: accounts.fan.uid,
        sodaOfferingId: sodaId,
        version: 1,
        category: "security-safety",
      }),
      call("moderator", "moderateReview", {
        authorId: accounts.fan.uid,
        sodaOfferingId: sodaId,
        expectedVersion: 1,
        expectedCycle: first.cycle,
        expectedQueueVersion: queue.get("queueVersion"),
        decision: "allow",
      }),
    ]);
    expect(results[0]?.status).toBe("fulfilled");

    const [current, finalQueue, published] = await Promise.all([
      adminDb.collection("profiles").doc(accounts.fan.uid).collection("reviews").doc(sodaId).get(),
      adminDb.collection("reviewModerationQueue").doc(key).get(),
      adminDb.collection("publishedReviews").doc(key).get(),
    ]);
    expect(current.get("moderationStatus")).toBe("pending");
    expect(finalQueue.data()).toMatchObject({
      securitySafety: true,
      queueKind: "security",
    });
    expect(published.exists).toBe(false);
  });

  it("observes current Auth revocation instead of a cached Moderator token claim", async () => {
    await adminAuth.setCustomUserClaims(accounts.moderator.uid, {});
    try {
      await expect(
        call("moderator", "loadReviewModerationQueue", { kind: "reported" }),
      ).rejects.toMatchObject({ code: "functions/permission-denied" });
    } finally {
      await adminAuth.setCustomUserClaims(accounts.moderator.uid, { moderator: true });
    }
  });

  it("observes current Auth disablement before accepting a report", async () => {
    await adminAuth.updateUser(accounts.secondFan.uid, { disabled: true });
    try {
      await expect(
        call("secondFan", "reportReview", {
          authorId: accounts.fan.uid,
          sodaOfferingId: "disabled-report",
          version: 1,
          category: "offensive",
        }),
      ).rejects.toMatchObject({ code: "functions/permission-denied" });
    } finally {
      await adminAuth.updateUser(accounts.secondFan.uid, { disabled: false });
    }
  });

  it("keeps cleared pending and hidden reviews in moderation when they are reposted", async () => {
    const sodaId = "clear-pending";
    await seedVisibleReview(sodaId);
    await call("secondFan", "reportReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      version: 1,
      category: "offensive",
    });
    const reference = adminDb
      .collection("profiles")
      .doc(accounts.fan.uid)
      .collection("reviews")
      .doc(sodaId);
    const reported = await reference.get();
    await reference.update({
      markdown: null,
      contentLength: 0,
      version: 2,
      authoredAt: new Date(),
      baseModerationCycle: reported.get("moderationCycle"),
      baseApprovedVersion: null,
      mutationId: randomUUID(),
    });
    await processReviewWrite(adminDb, accounts.fan.uid, sodaId, reported, await reference.get());
    await waitForReview(
      accounts.fan.uid,
      sodaId,
      (current, published) =>
        current.get("version") === 2 &&
        current.get("moderationStatus") === "pending" &&
        !published.exists,
    );

    const cleared = await reference.get();
    expect(cleared.get("moderationStatus")).toBe("pending");
    expect(cleared.get("moderationCycle")).toBe(reported.get("moderationCycle"));
    const clearedQueue = await adminDb
      .collection("reviewModerationQueue")
      .doc(reviewKey(accounts.fan.uid, sodaId))
      .get();
    expect(clearedQueue.exists).toBe(false);
    await reference.update({
      markdown: "A useful integration review.",
      contentLength: 28,
      version: 3,
      authoredAt: new Date(),
      baseModerationCycle: cleared.get("moderationCycle"),
      baseApprovedVersion: null,
      mutationId: randomUUID(),
    });
    await processReviewWrite(adminDb, accounts.fan.uid, sodaId, cleared, await reference.get());
    await waitForReview(
      accounts.fan.uid,
      sodaId,
      (current, published) =>
        current.get("version") === 3 &&
        current.get("moderationStatus") === "pending" &&
        !published.exists,
    );
    const key = reviewKey(accounts.fan.uid, sodaId);
    const repostedQueue = await adminDb.collection("reviewModerationQueue").doc(key).get();
    expect(repostedQueue.data()).toMatchObject({
      cycle: reported.get("moderationCycle"),
      queueKind: "revised",
    });

    await call("moderator", "moderateReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      expectedVersion: 3,
      expectedCycle: repostedQueue.get("cycle"),
      expectedQueueVersion: repostedQueue.get("queueVersion"),
      decision: "hide",
      explanation: "Please revise before reposting.",
    });
    const hidden = await reference.get();
    await reference.update({
      markdown: null,
      contentLength: 0,
      version: 4,
      authoredAt: new Date(),
      baseModerationCycle: hidden.get("moderationCycle"),
      baseApprovedVersion: null,
      mutationId: randomUUID(),
    });
    await processReviewWrite(adminDb, accounts.fan.uid, sodaId, hidden, await reference.get());
    const clearedHidden = await reference.get();
    expect(clearedHidden.get("moderationStatus")).toBe("hidden");
    const clearedHiddenQueue = await adminDb.collection("reviewModerationQueue").doc(key).get();
    expect(clearedHiddenQueue.exists).toBe(false);
    await reference.update({
      markdown: "A useful integration review.",
      contentLength: 28,
      version: 5,
      authoredAt: new Date(),
      baseModerationCycle: clearedHidden.get("moderationCycle"),
      baseApprovedVersion: null,
      mutationId: randomUUID(),
    });
    await processReviewWrite(
      adminDb,
      accounts.fan.uid,
      sodaId,
      clearedHidden,
      await reference.get(),
    );
    const repostedHidden = await reference.get();
    expect(repostedHidden.get("moderationStatus")).toBe("pending");
    const repostedHiddenQueue = await adminDb.collection("reviewModerationQueue").doc(key).get();
    expect(repostedHiddenQueue.exists).toBe(true);
    await adminDb.collection("reviewModerationQueue").doc(key).delete();
  });

  it("keeps Security/Safety protection after a hidden review is revised", async () => {
    const sodaId = "hidden-security";
    await seedVisibleReview(sodaId);
    const report = await call<{ cycle: number }>("secondFan", "reportReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      version: 1,
      category: "security-safety",
    });
    const key = reviewKey(accounts.fan.uid, sodaId);
    const queue = await adminDb.collection("reviewModerationQueue").doc(key).get();
    await call("moderator", "moderateReview", {
      authorId: accounts.fan.uid,
      sodaOfferingId: sodaId,
      expectedVersion: 1,
      expectedCycle: report.cycle,
      expectedQueueVersion: queue.get("queueVersion"),
      decision: "hide",
      explanation: "Security review required.",
    });
    const reference = adminDb
      .collection("profiles")
      .doc(accounts.fan.uid)
      .collection("reviews")
      .doc(sodaId);
    const hidden = await reference.get();
    expect(hidden.get("moderationSecuritySafety")).toBe(true);
    await reference.update({
      markdown: "A useful integration review.",
      contentLength: 28,
      version: 2,
      authoredAt: new Date(),
      baseModerationCycle: hidden.get("moderationCycle"),
      baseApprovedVersion: null,
      mutationId: randomUUID(),
    });
    await waitForReview(
      accounts.fan.uid,
      sodaId,
      (current, published) =>
        current.get("version") === 2 &&
        current.get("moderationStatus") === "pending" &&
        !published.exists,
    );

    const protectedQueue = await adminDb.collection("reviewModerationQueue").doc(key).get();
    expect(protectedQueue.data()).toMatchObject({
      queueKind: "security",
      securitySafety: true,
    });
    const listed = await call<{
      items: Array<{
        id: string;
        current: { protectedContent: boolean };
        history: { versions: Array<{ review?: { markdown?: string } }> };
      }>;
    }>("moderator", "loadReviewModerationQueue", { kind: "security" });
    const protectedItem = listed.items.find((item) => item.id === key);
    expect(protectedItem?.current.protectedContent).toBe(true);
    expect(protectedItem?.history.versions.map((item) => item.review?.markdown)).toEqual([
      "[protected]",
      "[protected]",
    ]);
    await adminDb.collection("reviewModerationQueue").doc(key).delete();
  });

  it("reconciles unordered rating deliveries from the authoritative current rating", async () => {
    const sodaId = "rating-order";
    await seedVisibleReview(sodaId);
    const key = reviewKey(accounts.fan.uid, sodaId);
    await adminDb
      .collection("profiles")
      .doc(accounts.fan.uid)
      .collection("ratings")
      .doc(sodaId)
      .update({ rating: 5 });
    await adminDb.collection("publishedReviews").doc(key).update({ rating: 2 });

    await Promise.all([
      syncPublishedReviewRating(adminDb, accounts.fan.uid, sodaId),
      syncPublishedReviewRating(adminDb, accounts.fan.uid, sodaId),
    ]);

    expect((await adminDb.collection("publishedReviews").doc(key).get()).get("rating")).toBe(5);
  });

  it("uses a stable cursor when earlier moderation entries are removed", async () => {
    const existing = await adminDb
      .collection("reviewModerationQueue")
      .where("queueKind", "==", "revised")
      .get();
    await Promise.all(existing.docs.map(async (item) => await item.ref.delete()));
    await Promise.all(
      Array.from(
        { length: 6 },
        async (_value, index) => await seedVisibleReview(`cursor-soda-${index}`),
      ),
    );
    await Promise.all(
      Array.from(
        { length: 6 },
        async (_value, index) =>
          await adminDb
            .collection("reviewModerationQueue")
            .doc(`cursor-${index}`)
            .set({
              authorId: accounts.fan.uid,
              sodaOfferingId: `cursor-soda-${index}`,
              latestVersion: 1,
              cycle: 1,
              queueVersion: 1,
              queueKind: "revised",
              pendingSince: new Date(1_000 + index),
            }),
      ),
    );
    const first = await call<{
      items: Array<{ id: string }>;
      next?: { pendingSinceMillis: number; id: string };
    }>("moderator", "loadReviewModerationQueue", { kind: "revised" });
    expect(first.items.map((item) => item.id)).toEqual([
      "cursor-0",
      "cursor-1",
      "cursor-2",
      "cursor-3",
      "cursor-4",
    ]);
    const cursor = first.next;
    if (cursor === undefined) throw new Error("Expected a moderation cursor.");
    await adminDb.collection("reviewModerationQueue").doc("cursor-0").delete();

    const second = await call<{ items: Array<{ id: string }> }>(
      "moderator",
      "loadReviewModerationQueue",
      { kind: "revised", cursor },
    );
    expect(second.items.map((item) => item.id)).toEqual(["cursor-5"]);
    await Promise.all(
      Array.from(
        { length: 6 },
        async (_value, index) =>
          await adminDb.collection("reviewModerationQueue").doc(`cursor-${index}`).delete(),
      ),
    );
  });
});
