// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineBoolean, defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onUserCreated } from "firebase-functions/v2/identity";
import { auditableSnapshot } from "./audit.js";
import { FirestoreUserAuditStore } from "./firestore-audit-store.js";
import { FirestoreManagementStore } from "./firestore-store.js";
import {
  ServiceError,
  UserManagementService,
  type ApplyUserManagementInput,
  type SearchUsersInput,
} from "./management.js";

const REGION = "us-central1";
const operatorUids = defineString("OPERATOR_UIDS_JSON", {
  description: "A JSON array of unique Firebase Auth UIDs with Operator authority.",
  format: "json",
  input: { text: { nonEmpty: true } },
});
const enforceAppCheck = defineBoolean("ENFORCE_APP_CHECK", {
  default: false,
  description: "Reject callable requests without valid App Check tokens.",
});
const getMyAuthorizationServiceAccount = defineString("GET_MY_AUTHORIZATION_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for getMyAuthorization.",
  input: { text: { nonEmpty: true } },
});
const searchUsersServiceAccount = defineString("SEARCH_USERS_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for searchUsers.",
  input: { text: { nonEmpty: true } },
});
const revealUserEmailServiceAccount = defineString("REVEAL_USER_EMAIL_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for revealUserEmail.",
  input: { text: { nonEmpty: true } },
});
const saveMyProfileServiceAccount = defineString("SAVE_MY_PROFILE_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for saveMyProfile.",
  input: { text: { nonEmpty: true } },
});
const applyUserManagementServiceAccount = defineString("APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for applyUserManagement.",
  input: { text: { nonEmpty: true } },
});
const getUserAuditHistoryServiceAccount = defineString("GET_USER_AUDIT_HISTORY_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for getUserAuditHistory.",
  input: { text: { nonEmpty: true } },
});
const recordAccountCreationServiceAccount = defineString(
  "RECORD_ACCOUNT_CREATION_SERVICE_ACCOUNT",
  {
    description: "Least-privilege runtime identity for recordAccountCreation.",
    input: { text: { nonEmpty: true } },
  },
);
const app = initializeApp();
const firestore = getFirestore(app);
const auditStore = new FirestoreUserAuditStore(firestore);
const service = new UserManagementService(
  getAuth(app),
  new FirestoreManagementStore(firestore),
  () => {
    try {
      return operatorUids.value();
    } catch {
      return undefined;
    }
  },
  undefined,
  undefined,
  auditStore,
);
const callableOptions = {
  region: REGION,
  // App Check is a deployment-controlled abuse defense; auth and server-side
  // authorization below remain the security boundary.
  enforceAppCheck: process.env["FUNCTIONS_EMULATOR"] === "true" ? false : enforceAppCheck,
};

/**
 * Translate service-layer failures into stable callable-function errors.
 *
 * @param execute - Async callback that invokes one service-layer method.
 * @returns The callback result when it succeeds.
 */
async function translateErrors<T>(execute: () => Promise<T>): Promise<T> {
  try {
    return await execute();
  } catch (error) {
    if (error instanceof ServiceError) throw new HttpsError(error.code, error.message);
    const code: unknown =
      typeof error === "object" && error !== null ? Reflect.get(error, "code") : undefined;
    logger.error("User-management operation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
      errorCode: typeof code === "string" || typeof code === "number" ? code : undefined,
    });
    throw new HttpsError("internal", "The operation could not be completed.");
  }
}

/** Return server-evaluated claims and restriction state for the signed-in user. */
export const getMyAuthorization = onCall(
  { ...callableOptions, serviceAccount: getMyAuthorizationServiceAccount },
  async (request) =>
    await translateErrors(async () => await service.getMyAuthorization(request.auth?.uid)),
);

/** Perform bounded, privileged Auth user lookup without creating a public directory. */
export const searchUsers = onCall<SearchUsersInput>(
  { ...callableOptions, serviceAccount: searchUsersServiceAccount },
  async (request) =>
    await translateErrors(async () => await service.searchUsers(request.auth?.uid, request.data)),
);

/** Explicitly reveal one manageable user's email without persisting it. */
export const revealUserEmail = onCall<{ targetUid: string }>(
  { ...callableOptions, serviceAccount: revealUserEmailServiceAccount },
  async (request) =>
    await translateErrors(
      async () => await service.revealUserEmail(request.auth?.uid, request.data?.targetUid),
    ),
);

/** Persist a self-service public-profile change with one immutable audit event. */
export const saveMyProfile = onCall<{ publicName: string }>(
  { ...callableOptions, serviceAccount: saveMyProfileServiceAccount },
  async (request) =>
    await translateErrors(
      async () => await service.saveMyProfile(request.auth?.uid, request.data?.publicName),
    ),
);

/** Apply one versioned user-management operation using current server authority. */
export const applyUserManagement = onCall<ApplyUserManagementInput>(
  { ...callableOptions, serviceAccount: applyUserManagementServiceAccount },
  async (request) =>
    await translateErrors(
      async () => await service.applyUserManagement(request.auth?.uid, request.data),
    ),
);

/** Return one user's immutable audit history after current-authority checks. */
export const getUserAuditHistory = onCall<{
  targetUid: string;
  beforeSequence?: number;
}>(
  { ...callableOptions, serviceAccount: getUserAuditHistoryServiceAccount },
  async (request) =>
    await translateErrors(
      async () =>
        await service.getAuditHistory(
          request.auth?.uid,
          request.data?.targetUid,
          request.data?.beforeSequence,
        ),
    ),
);

/** Record post-rollout account creation with an explicit non-human system actor. */
export const recordAccountCreation = onUserCreated(
  { region: REGION, retry: true, serviceAccount: recordAccountCreationServiceAccount },
  async (event) => {
    const user = event.data;
    const after = auditableSnapshot(user, null, undefined, {});
    await auditStore.appendInitialEvent(
      {
        id: `account-created:${user.uid}`,
        actor: { kind: "system", id: "firebase-auth" },
        subjectUid: user.uid,
        type: "account.created",
        before: null,
        after,
        changedFields: ["auth"],
      },
      new Date(user.metadata.creationTime),
    );
  },
);
