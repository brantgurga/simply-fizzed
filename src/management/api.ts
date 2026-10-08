// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export interface RestrictionView {
  publicReason: string;
  originallyRestrictedBy: string;
  originallyRestrictedAt: string;
  restrictionLastUpdatedBy: string;
  restrictionLastUpdatedAt: string;
  expiresAt: string | null;
  internalReason?: string;
}

export interface AuthorizationView {
  moderator: boolean;
  operator: boolean;
  restricted: boolean;
  canWriteCommunity: boolean;
  canManageUsers: boolean;
  evaluatedAt: string;
  restriction: RestrictionView | null;
}

export interface ManagedUser {
  uid: string;
  displayName: string | null;
  obfuscatedEmail: string | null;
  disabled: boolean;
  moderator: boolean;
  auditVersion: number;
  canManage: boolean;
  restriction: RestrictionView | null;
}

export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };
export type AuditActor = { kind: "user"; uid: string } | { kind: "system"; id: "firebase-auth" };

export interface AuditEvent {
  id: string;
  actor: AuditActor;
  subjectUid: string;
  type: string;
  sequence: number;
  occurredAt: string;
  before: AuditJson;
  after: AuditJson;
  reason?: string;
  changedFields?: string[];
}

export interface AuditIdentity {
  uid: string;
  displayName: string | null;
  email: string | null;
  unavailable: boolean;
}

export interface AuditHistory {
  events: AuditEvent[];
  identities: AuditIdentity[];
  version: number;
  nextBeforeSequence?: number;
}

export type SearchMode = "uid" | "email" | "displayName";

export interface RestrictionDraft {
  publicReason: string;
  internalReason?: string;
  expiresAt?: string;
}

export interface ManagementChanges {
  targetUid: string;
  expectedVersion: number;
  reason: string;
  disabled?: boolean;
  moderator?: boolean;
  restriction?: RestrictionDraft | null;
}

/** Signals that an online-only management operation was attempted offline. */
export class ManagementOfflineError extends Error {
  constructor() {
    super("User management requires an internet connection.");
    this.name = "ManagementOfflineError";
  }
}

/** Reject management requests before invoking a callable while the browser is offline. */
function requireOnline(): void {
  if (!navigator.onLine) throw new ManagementOfflineError();
}

/** Fetch current server-evaluated authority. This call is never queued offline. */
export async function loadMyAuthorization(): Promise<AuthorizationView> {
  requireOnline();
  const callable = httpsCallable<Record<string, never>, AuthorizationView>(
    functions,
    "getMyAuthorization",
  );
  return (await callable({})).data;
}

/** Search a bounded privileged Auth view; no results are persisted by this module. */
export async function searchManagedUsers(mode: SearchMode, query: string): Promise<ManagedUser[]> {
  requireOnline();
  const callable = httpsCallable<{ mode: SearchMode; query: string }, ManagedUser[]>(
    functions,
    "searchUsers",
  );
  return (await callable({ mode, query })).data;
}

/** Explicitly reveal one email for the current component session only. */
export async function revealManagedUserEmail(targetUid: string): Promise<string | null> {
  requireOnline();
  const callable = httpsCallable<{ targetUid: string }, { email: string | null }>(
    functions,
    "revealUserEmail",
  );
  return (await callable({ targetUid })).data.email;
}

/** Load immutable history using current server-evaluated authority. */
export async function loadUserAuditHistory(
  targetUid: string,
  beforeSequence?: number,
): Promise<AuditHistory> {
  requireOnline();
  const callable = httpsCallable<{ targetUid: string; beforeSequence?: number }, AuditHistory>(
    functions,
    "getUserAuditHistory",
  );
  return (
    await callable({
      targetUid,
      ...(beforeSequence === undefined ? {} : { beforeSequence }),
    })
  ).data;
}

/** Commit staged management changes and return only confirmed server state. */
export async function applyManagementChanges(changes: ManagementChanges): Promise<ManagedUser> {
  requireOnline();
  const callable = httpsCallable<ManagementChanges, ManagedUser>(functions, "applyUserManagement");
  return (await callable(changes)).data;
}
