// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { expect } from "expect";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth, type Auth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, type Firestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, type User } from "firebase/auth";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from "firebase/functions";

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
  const callable = httpsCallable<unknown, T>(client.functions, functionName);
  return (await callable(data)).data;
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

  it("lets an unrestricted Moderator find Fans but not another Moderator", async () => {
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
    ).resolves.toEqual([]);
    await expect(
      call("moderator", "applyUserManagement", {
        targetUid: accounts.restrictedModerator.uid,
        restriction: null,
      }),
    ).rejects.toMatchObject({ code: "functions/permission-denied" });
  });

  it("prevents a Moderator from discovering or managing a configured Operator", async () => {
    await expect(
      call<unknown[]>("moderator", "searchUsers", {
        mode: "uid",
        query: accounts.operator.uid,
      }),
    ).resolves.toEqual([]);
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

  it("rejects an unauthenticated direct callable request", async () => {
    const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/searchUsers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { mode: "uid", query: accounts.fan.uid } }),
    });

    expect(response.status).toBe(401);
  });
});
