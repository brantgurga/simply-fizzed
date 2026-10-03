import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
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
const applyUserManagementServiceAccount = defineString("APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT", {
  description: "Least-privilege runtime identity for applyUserManagement.",
  input: { text: { nonEmpty: true } },
});

const app = getApps()[0] ?? initializeApp();
const service = new UserManagementService(
  getAuth(app),
  new FirestoreManagementStore(getFirestore(app)),
  () => {
    try {
      return operatorUids.value();
    } catch {
      return undefined;
    }
  },
);
const callableOptions = {
  region: REGION,
  // App Check limits abuse in hosted environments; auth and server-side
  // authorization below remain the security boundary. Emulators have no attester.
  enforceAppCheck: process.env["FUNCTIONS_EMULATOR"] !== "true",
  timeoutSeconds: 30,
  memory: "256MiB" as const,
  maxInstances: 10,
};

async function translateErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ServiceError) throw new HttpsError(error.code, error.message);
    logger.error("User-management operation failed", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    throw new HttpsError("internal", "The operation could not be completed.");
  }
}

/** Return server-evaluated claims and restriction state for the signed-in user. */
export const getMyAuthorization = onCall(
  { ...callableOptions, serviceAccount: getMyAuthorizationServiceAccount },
  (request) => translateErrors(() => service.getMyAuthorization(request.auth?.uid)),
);

/** Perform bounded, privileged Auth user lookup without creating a public directory. */
export const searchUsers = onCall<SearchUsersInput>(
  { ...callableOptions, serviceAccount: searchUsersServiceAccount },
  (request) => translateErrors(() => service.searchUsers(request.auth?.uid, request.data)),
);

/** Explicitly reveal one manageable user's email without persisting it. */
export const revealUserEmail = onCall<{ targetUid: string }>(
  { ...callableOptions, serviceAccount: revealUserEmailServiceAccount },
  (request) =>
    translateErrors(() => service.revealUserEmail(request.auth?.uid, request.data?.targetUid)),
);

/** Apply staged restriction and/or Moderator changes using current server authority. */
export const applyUserManagement = onCall<ApplyUserManagementInput>(
  { ...callableOptions, serviceAccount: applyUserManagementServiceAccount },
  (request) => translateErrors(() => service.applyUserManagement(request.auth?.uid, request.data)),
);
