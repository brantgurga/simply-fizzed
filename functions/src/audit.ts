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
  auth: {
    disabled: boolean;
    displayName: string | null;
    email: string | null;
    hasProfileImage: boolean;
    moderator: boolean;
  };
  profile: AuditJson;
  restriction: AuditJson;
}

/** Describes an audit event before the store assigns ordering and time metadata. */
export interface AuditEventDraft {
  id: string;
  actor: AuditActor;
  subjectUid: string;
  type: AuditEventType;
  before: AuditableUserSnapshot | null;
  after: AuditableUserSnapshot | null;
  reason?: string;
  changedFields?: string[];
}

/** Represents a persisted audit event with stable chronological metadata. */
export interface AuditEvent extends AuditEventDraft {
  sequence: number;
  occurredAt: string;
}

/** Identifies an optimistic, recoverable mutation of one user's audited state. */
export interface AuditOperation {
  id: string;
  subjectUid: string;
  expectedVersion: number;
}

/** Specifies whether a pending mutation is cancelled or reconciled into the audit log. */
export type AuditRecoveryDraft =
  | { kind: "cancel" }
  | {
      kind: "reconcile";
      actor: AuditActor;
      before: AuditableUserSnapshot;
      reason: string;
    };

/** Contains one newest-first page of audit events and its optional older-page cursor. */
export interface AuditEventPage {
  events: AuditEvent[];
  nextBeforeSequence?: number;
}

/** Defines durable audit storage, optimistic concurrency, recovery, and history queries. */
export interface UserAuditStore {
  getVersion(subjectUid: string): Promise<number>;
  hasPendingOperation(subjectUid: string): Promise<boolean>;
  beginOperation(operation: AuditOperation, recovery?: AuditRecoveryDraft): Promise<void>;
  completeOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    occurredAt: Date,
  ): Promise<void>;
  completeProfileOperation(
    operation: AuditOperation,
    draft: AuditEventDraft,
    publicName: string,
    occurredAt: Date,
  ): Promise<void>;
  cancelOperation(operation: AuditOperation): Promise<void>;
  recoverPendingOperation(subjectUid: string, after: AuditableUserSnapshot): Promise<boolean>;
  appendInitialEvent(draft: AuditEventDraft, occurredAt: Date): Promise<void>;
  listEvents(subjectUid: string, beforeSequence?: number): Promise<AuditEventPage>;
  readProfile(subjectUid: string): Promise<AuditJson>;
}

/** Convert current trusted state to a stable, secret-free audit snapshot. */
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

/** Return shallow semantic paths for display only; snapshots remain authoritative. */
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
