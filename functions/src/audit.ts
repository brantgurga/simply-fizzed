// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import type { AuthUser, PrivateUserData, RestrictionRecord } from "./management.js";

/** Identifies the trusted operation represented by an audit event. */
export type AuditEventType =
  | "account.created"
  | "profile.updated"
  | "credential.changed"
  | "user.restricted"
  | "user.restriction-updated"
  | "user.unrestricted"
  | "user.disabled"
  | "user.enabled"
  | "user.moderator-promoted"
  | "user.moderator-demoted"
  | "user.management-updated";

/** Identifies the user or trusted system that caused an audited change. */
export type AuditActor = { kind: "user"; uid: string } | { kind: "system"; id: "firebase-auth" };

/** Represents immutable, JSON-compatible evidence stored in the audit log. */
export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };

/** Captures the secret-free user state retained before or after an audited change. */
export interface AuditableUserSnapshot {
  /** Contains trusted Firebase Auth state safe to retain in history. */
  auth: {
    /** Indicates whether Firebase Auth disables the account. */
    disabled: boolean;
    /** Provides the normalized Auth display name when present. */
    displayName: string | null;
    /** Provides the normalized Auth email when present. */
    email: string | null;
    /** Indicates whether an image exists without retaining its mutable URL. */
    hasProfileImage: boolean;
    /** Indicates whether the moderator custom claim is authoritative. */
    moderator: boolean;
  };
  /** Captures the current public profile as immutable JSON evidence. */
  profile: AuditJson;
  /** Captures restriction state, including private context, or `null`. */
  restriction: AuditJson;
}

/** Describes an audit event before the store assigns ordering and time metadata. */
export interface AuditEventDraft {
  /** Uniquely identifies this event and its operation when applicable. */
  id: string;
  /** Identifies the principal that caused the change. */
  actor: AuditActor;
  /** Identifies the user whose state changed. */
  subjectUid: string;
  /** Classifies the trusted operation that produced the event. */
  type: AuditEventType;
  /** Captures trusted state immediately before the operation, or `null` for creation. */
  before: AuditableUserSnapshot | null;
  /** Captures trusted state immediately after the operation, or `null` for deletion. */
  after: AuditableUserSnapshot | null;
  /** Explains why an authorized manager made the change when applicable. */
  reason?: string;
  /** Summarizes changed top-level snapshot sections for display only. */
  changedFields?: string[];
}

/** Represents a persisted audit event with stable chronological metadata. */
export interface AuditEvent extends AuditEventDraft {
  /** Orders events monotonically within one subject's history. */
  sequence: number;
  /** Records the canonical UTC ISO instant when the event occurred. */
  occurredAt: string;
}

/** Identifies an optimistic, recoverable mutation of one user's audited state. */
export interface AuditOperation {
  /** Uniquely identifies the reservation and eventual event. */
  id: string;
  /** Identifies the user whose state is being changed. */
  subjectUid: string;
  /** Requires this current audit version before reserving the operation. */
  expectedVersion: number;
}

/** Specifies whether a pending mutation is cancelled or reconciled into the audit log. */
export type AuditRecoveryDraft =
  | { kind: "cancel" }
  | {
      /** Selects reconciliation when an external mutation may already have succeeded. */
      kind: "reconcile";
      /** Identifies the principal that initiated the pending mutation. */
      actor: AuditActor;
      /** Captures trusted state from before the external mutation. */
      before: AuditableUserSnapshot;
      /** Explains the management action in immutable history. */
      reason: string;
    };

/** Contains one newest-first page of audit events and its optional older-page cursor. */
export interface AuditEventPage {
  /** Contains immutable events in descending sequence order. */
  events: AuditEvent[];
  /** Selects the next older page when more events exist. */
  nextBeforeSequence?: number;
}

/** Defines durable audit storage, optimistic concurrency, recovery, and history queries. */
export interface UserAuditStore {
  /**
   * Read the subject's current optimistic-concurrency version.
   *
   * @param subjectUid - Identifies the user whose audit stream is read.
   * @returns A promise resolving to the current nonnegative version, or zero before initialization.
   */
  getVersion(subjectUid: string): Promise<number>;

  /**
   * Determine whether the subject has a reserved operation awaiting completion or recovery.
   *
   * @param subjectUid - Identifies the user whose audit state is inspected.
   * @returns A promise resolving to `true` only while an operation reservation is pending.
   */
  hasPendingOperation(subjectUid: string): Promise<boolean>;

  /**
   * Reserve one optimistic operation before mutating external state.
   *
   * @param operation - Identifies the subject, operation, and required current version.
   * @param recovery - Describes how startup recovery handles an interrupted external mutation.
   * @returns A promise that resolves after the durable reservation is created.
   */
  beginOperation(operation: AuditOperation, recovery?: AuditRecoveryDraft): Promise<void>;

  /**
   * Atomically append an event and release its matching operation reservation.
   *
   * @param operation - Identifies the previously reserved operation.
   * @param draft - Supplies immutable event evidence without store-assigned metadata.
   * @param occurredAt - Supplies the authoritative server instant for the event.
   * @returns A promise that resolves after the event and new version are durable.
   */
  completeOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    occurredAt: Date,
  ): Promise<void>;

  /**
   * Atomically update a public profile, append its event, and release the reservation.
   *
   * @param operation - Identifies the previously reserved operation.
   * @param draft - Supplies immutable event evidence without store-assigned metadata.
   * @param publicName - Supplies the normalized public profile name to persist.
   * @param occurredAt - Supplies the authoritative server instant for both writes.
   * @returns A promise that resolves after the profile, event, and version are durable.
   */
  completeProfileOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    publicName: string,
    occurredAt: Date,
  ): Promise<void>;

  /**
   * Mark an unfinished reservation as failed without advancing its audit version.
   *
   * @param operation - Identifies the reservation to cancel.
   * @returns A promise that resolves after cancellation, including when already resolved.
   */
  cancelOperation(operation: AuditOperation): Promise<void>;

  /**
   * Resolve an interrupted reservation against current trusted state.
   *
   * @param subjectUid - Identifies the user whose pending operation is recovered.
   * @param after - Captures current trusted state after the possible external mutation.
   * @returns A promise resolving to whether a pending operation was found and resolved.
   */
  recoverPendingOperation(subjectUid: string, after: AuditableUserSnapshot): Promise<boolean>;

  /**
   * Idempotently append an event when no optimistic reservation is required.
   *
   * @param draft - Supplies immutable event evidence for the subject.
   * @param occurredAt - Supplies the authoritative server instant for the event.
   * @returns A promise that resolves after the event is durable or already exists.
   */
  appendInitialEvent(draft: AuditEventDraft, occurredAt: Date): Promise<void>;

  /**
   * Read a bounded newest-first page from one subject's immutable stream.
   *
   * @param subjectUid - Identifies the user whose history is read.
   * @param beforeSequence - Excludes this sequence and every newer event when provided.
   * @returns A promise resolving to events and an older-page cursor when more history exists.
   */
  listEvents(subjectUid: string, beforeSequence?: number): Promise<AuditEventPage>;

  /**
   * Read the subject's public profile in JSON-compatible audit form.
   *
   * @param subjectUid - Identifies the user whose public profile is read.
   * @returns A promise resolving to profile evidence, or `null` when no profile exists.
   */
  readProfile(subjectUid: string): Promise<AuditJson>;
}

/**
 * Convert current trusted state to a stable, secret-free audit snapshot.
 *
 * @param user - Supplies authoritative Firebase Auth state.
 * @param profile - Supplies the current public profile in JSON-compatible form.
 * @param restriction - Supplies the active restriction when one exists.
 * @param privateData - Supplies private moderator context associated with the restriction.
 * @returns A normalized snapshot that excludes credentials and mutable image URLs.
 */
export function auditableSnapshot(
  user: AuthUser,
  profile: AuditJson,
  restriction: RestrictionRecord | undefined,
  privateData: PrivateUserData,
): AuditableUserSnapshot {
  return {
    auth: {
      disabled: user.disabled,
      displayName: user.displayName?.trim() || null,
      email: user.email?.trim() || null,
      hasProfileImage: typeof user.photoURL === "string" && user.photoURL.length > 0,
      moderator: user.customClaims?.["moderator"] === true,
    },
    profile,
    restriction:
      restriction === undefined
        ? null
        : {
            publicReason: restriction.publicReason,
            internalReason: privateData.internalReason ?? null,
            originallyRestrictedBy: restriction.originallyRestrictedBy,
            originallyRestrictedAt: restriction.originallyRestrictedAt.toISOString(),
            restrictionLastUpdatedBy: restriction.restrictionLastUpdatedBy,
            restrictionLastUpdatedAt: restriction.restrictionLastUpdatedAt.toISOString(),
            expiresAt: restriction.expiresAt?.toISOString() ?? null,
          },
  };
}

/**
 * Return shallow semantic paths for display only; snapshots remain authoritative.
 *
 * @param before - Supplies trusted state before the audited change.
 * @param after - Supplies trusted state after the audited change.
 * @returns Top-level snapshot sections whose JSON representations differ.
 */
export function changedSnapshotFields(
  before: AuditableUserSnapshot,
  after: AuditableUserSnapshot,
): string[] {
  const fields: string[] = [];
  for (const section of ["auth", "profile", "restriction"] as const) {
    const left = before[section];
    const right = after[section];
    if (JSON.stringify(left) !== JSON.stringify(right)) fields.push(section);
  }
  return fields;
}
