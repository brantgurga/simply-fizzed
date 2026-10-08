// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import type { AuthUser, PrivateUserData, RestrictionRecord } from "./management.js";

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

export type AuditActor = { kind: "user"; uid: string } | { kind: "system"; id: "firebase-auth" };
export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };

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

export interface AuditEvent extends AuditEventDraft {
  sequence: number;
  occurredAt: string;
}

export interface AuditOperation {
  id: string;
  subjectUid: string;
  expectedVersion: number;
}

export interface UserAuditStore {
  getVersion(subjectUid: string): Promise<number>;
  beginOperation(operation: AuditOperation): Promise<void>;
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
  listEvents(subjectUid: string): Promise<AuditEvent[]>;
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
