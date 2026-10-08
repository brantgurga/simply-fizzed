// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  type AuditActor,
  type AuditEvent,
  type AuditEventDraft,
  type AuditEventType,
  type AuditJson,
  type AuditOperation,
  type AuditableUserSnapshot,
  type UserAuditStore,
} from "./audit.js";
import { ServiceError } from "./management.js";

export const USER_AUDIT_COLLECTION = "userAudit";
export const USER_AUDIT_STATE_COLLECTION = "userAuditState";
export const USER_AUDIT_OPERATIONS_COLLECTION = "userAuditOperations";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuditJson(value: unknown): value is AuditJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every((item) => isAuditJson(item));
  return isRecord(value) && Object.values(value).every((item) => isAuditJson(item));
}

function auditableUserSnapshot(value: unknown): value is AuditableUserSnapshot | null {
  if (value === null) return true;
  if (!isRecord(value) || !isRecord(value["auth"])) return false;
  const auth = value["auth"];
  return (
    typeof auth["disabled"] === "boolean" &&
    (typeof auth["displayName"] === "string" || auth["displayName"] === null) &&
    (typeof auth["email"] === "string" || auth["email"] === null) &&
    typeof auth["hasProfileImage"] === "boolean" &&
    typeof auth["moderator"] === "boolean" &&
    isAuditJson(value["profile"]) &&
    isAuditJson(value["restriction"])
  );
}

function auditActor(value: unknown): AuditActor | undefined {
  if (!isRecord(value)) return undefined;
  if (value["kind"] === "user" && typeof value["uid"] === "string") {
    return { kind: "user", uid: value["uid"] };
  }
  if (value["kind"] === "system" && value["id"] === "firebase-auth") {
    return { kind: "system", id: "firebase-auth" };
  }
  return undefined;
}

function auditEventType(value: unknown): AuditEventType | undefined {
  switch (value) {
    case "account.created":
    case "profile.updated":
    case "credential.changed":
    case "user.restricted":
    case "user.restriction-updated":
    case "user.unrestricted":
    case "user.disabled":
    case "user.enabled":
    case "user.moderator-promoted":
    case "user.moderator-demoted":
    case "user.management-updated":
      return value;
    default:
      return undefined;
  }
}

/** Firestore-backed immutable per-subject audit streams and durable operation reservations. */
export class FirestoreUserAuditStore implements UserAuditStore {
  readonly #db: Firestore;

  constructor(db: Firestore) {
    this.#db = db;
  }

  async getVersion(subjectUid: string): Promise<number> {
    const snapshot = await this.#db.collection(USER_AUDIT_STATE_COLLECTION).doc(subjectUid).get();
    const version = snapshot.get("version");
    return typeof version === "number" && Number.isSafeInteger(version) && version >= 0
      ? version
      : 0;
  }

  async beginOperation(operation: AuditOperation): Promise<void> {
    const stateReference = this.#db
      .collection(USER_AUDIT_STATE_COLLECTION)
      .doc(operation.subjectUid);
    const operationReference = this.#db
      .collection(USER_AUDIT_OPERATIONS_COLLECTION)
      .doc(operation.id);
    await this.#db.runTransaction(async (transaction) => {
      const [state, existingOperation] = await Promise.all([
        transaction.get(stateReference),
        transaction.get(operationReference),
      ]);
      if (existingOperation.exists) {
        if (existingOperation.get("status") === "pending") return;
        throw new ServiceError("invalid-argument", "This operation has already completed.");
      }
      const version = state.get("version") ?? 0;
      if (version !== operation.expectedVersion || state.get("pendingOperationId") !== undefined) {
        throw new ServiceError(
          "failed-precondition",
          "The user changed since it was loaded. Reload current state and history.",
        );
      }
      transaction.set(
        stateReference,
        { version, pendingOperationId: operation.id },
        { merge: true },
      );
      transaction.create(operationReference, {
        subjectUid: operation.subjectUid,
        expectedVersion: operation.expectedVersion,
        status: "pending",
        createdAt: Timestamp.now(),
      });
    });
  }

  async completeOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    occurredAt: Date,
  ): Promise<void> {
    const stateReference = this.#db
      .collection(USER_AUDIT_STATE_COLLECTION)
      .doc(operation.subjectUid);
    const eventReference = this.#db
      .collection(USER_AUDIT_COLLECTION)
      .doc(operation.subjectUid)
      .collection("events")
      .doc(draft.id);
    const operationReference = this.#db
      .collection(USER_AUDIT_OPERATIONS_COLLECTION)
      .doc(operation.id);
    await this.#db.runTransaction(async (transaction) => {
      const [state, existingEvent, operationRecord] = await Promise.all([
        transaction.get(stateReference),
        transaction.get(eventReference),
        transaction.get(operationReference),
      ]);
      if (existingEvent.exists && operationRecord.get("status") === "complete") return;
      if (
        state.get("pendingOperationId") !== operation.id ||
        state.get("version") !== operation.expectedVersion ||
        operationRecord.get("status") !== "pending"
      ) {
        throw new ServiceError("failed-precondition", "Audit operation reservation was lost.");
      }
      const sequence = operation.expectedVersion + 1;
      transaction.create(eventReference, {
        ...draft,
        sequence,
        occurredAt: Timestamp.fromDate(occurredAt),
      });
      transaction.set(stateReference, { version: sequence });
      transaction.update(operationReference, {
        status: "complete",
        completedAt: Timestamp.now(),
        eventId: draft.id,
      });
    });
  }

  async completeProfileOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    publicName: string,
    occurredAt: Date,
  ): Promise<void> {
    const stateReference = this.#db
      .collection(USER_AUDIT_STATE_COLLECTION)
      .doc(operation.subjectUid);
    const profileReference = this.#db.collection("profiles").doc(operation.subjectUid);
    const eventReference = this.#db
      .collection(USER_AUDIT_COLLECTION)
      .doc(operation.subjectUid)
      .collection("events")
      .doc(draft.id);
    const operationReference = this.#db
      .collection(USER_AUDIT_OPERATIONS_COLLECTION)
      .doc(operation.id);
    await this.#db.runTransaction(async (transaction) => {
      const [state, existingEvent, operationRecord] = await Promise.all([
        transaction.get(stateReference),
        transaction.get(eventReference),
        transaction.get(operationReference),
      ]);
      if (existingEvent.exists && operationRecord.get("status") === "complete") return;
      if (
        state.get("pendingOperationId") !== operation.id ||
        state.get("version") !== operation.expectedVersion ||
        operationRecord.get("status") !== "pending"
      ) {
        throw new ServiceError("failed-precondition", "Audit operation reservation was lost.");
      }
      const sequence = operation.expectedVersion + 1;
      const timestamp = Timestamp.fromDate(occurredAt);
      transaction.set(profileReference, { publicName, updatedAt: timestamp }, { merge: true });
      transaction.create(eventReference, { ...draft, sequence, occurredAt: timestamp });
      transaction.set(stateReference, { version: sequence });
      transaction.update(operationReference, {
        status: "complete",
        completedAt: Timestamp.now(),
        eventId: draft.id,
      });
    });
  }

  async cancelOperation(operation: AuditOperation): Promise<void> {
    const stateReference = this.#db
      .collection(USER_AUDIT_STATE_COLLECTION)
      .doc(operation.subjectUid);
    const operationReference = this.#db
      .collection(USER_AUDIT_OPERATIONS_COLLECTION)
      .doc(operation.id);
    await this.#db.runTransaction(async (transaction) => {
      const [state, operationRecord] = await Promise.all([
        transaction.get(stateReference),
        transaction.get(operationReference),
      ]);
      if (!operationRecord.exists || operationRecord.get("status") !== "pending") return;
      if (state.get("pendingOperationId") === operation.id) {
        transaction.set(stateReference, { version: operation.expectedVersion });
      }
      transaction.update(operationReference, { status: "failed", failedAt: Timestamp.now() });
    });
  }

  async listEvents(subjectUid: string): Promise<AuditEvent[]> {
    const snapshots = await this.#db
      .collection(USER_AUDIT_COLLECTION)
      .doc(subjectUid)
      .collection("events")
      .orderBy("sequence", "desc")
      .get();
    return snapshots.docs.map((snapshot): AuditEvent => {
      const value: unknown = snapshot.data();
      if (!isRecord(value)) throw new Error("Invalid audit event.");
      const occurredAt = value["occurredAt"];
      const actor = auditActor(value["actor"]);
      const type = auditEventType(value["type"]);
      const before = value["before"];
      const after = value["after"];
      if (
        !(occurredAt instanceof Timestamp) ||
        actor === undefined ||
        type === undefined ||
        typeof value["id"] !== "string" ||
        typeof value["subjectUid"] !== "string" ||
        typeof value["sequence"] !== "number" ||
        !auditableUserSnapshot(before) ||
        !auditableUserSnapshot(after)
      ) {
        throw new Error("Invalid audit event.");
      }
      const reason = value["reason"];
      const changedFields = value["changedFields"];
      const event: AuditEvent = {
        id: value["id"],
        actor,
        subjectUid: value["subjectUid"],
        type,
        sequence: value["sequence"],
        occurredAt: occurredAt.toDate().toISOString(),
        before,
        after,
      };
      if (typeof reason === "string") event.reason = reason;
      if (Array.isArray(changedFields)) {
        const strings = changedFields.filter((field): field is string => typeof field === "string");
        if (strings.length === changedFields.length) event.changedFields = strings;
      }
      return event;
    });
  }

  async readProfile(subjectUid: string): Promise<AuditJson> {
    const snapshot = await this.#db.collection("profiles").doc(subjectUid).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    return {
      publicName: typeof data["publicName"] === "string" ? data["publicName"] : null,
      updatedAt:
        data["updatedAt"] instanceof Timestamp ? data["updatedAt"].toDate().toISOString() : null,
    };
  }
}
