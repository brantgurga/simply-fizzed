// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/** A canonical UTC ISO-8601 instant produced by {@link Date.toISOString}. */
export type IsoTimestamp = `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`;

/** Represents moderator-visible restriction state returned by trusted callables. */
export interface RestrictionView {
  /** Explains the restriction to the affected user. */
  publicReason: string;
  /** Identifies the moderator who first restricted the user. */
  originallyRestrictedBy: string;
  /** Records when the restriction was first created. */
  originallyRestrictedAt: IsoTimestamp;
  /** Identifies the moderator who most recently changed the restriction. */
  restrictionLastUpdatedBy: string;
  /** Records when the restriction was most recently changed. */
  restrictionLastUpdatedAt: IsoTimestamp;
  /**
   * Records the exclusive end instant, or `null` for no scheduled expiration.
   * The restriction is inactive when server time is equal to or later than this instant.
   */
  expiresAt: IsoTimestamp | null;
  /** Gives authorized managers private context that is never shown publicly. */
  internalReason?: string;
}

/** Describes the current user's server-evaluated management authority. */
export interface AuthorizationView {
  /** Indicates whether the caller has the moderator custom claim. */
  moderator: boolean;
  /** Indicates whether deployment configuration grants operator authority. */
  operator: boolean;
  /** Indicates whether the caller currently has an active restriction. */
  restricted: boolean;
  /** Indicates whether the caller may write community content. */
  canWriteCommunity: boolean;
  /** Indicates whether the caller may access user-management operations. */
  canManageUsers: boolean;
  /** Records the server instant used to evaluate this authority. */
  evaluatedAt: IsoTimestamp;
  /** Provides the active restriction visible to the caller, when present. */
  restriction: RestrictionView | null;
}

/** Contains the bounded user state available to an authorized manager. */
export interface ManagedUser {
  /** Identifies the managed Firebase Auth user. */
  uid: string;
  /** Provides the Auth display name when one is set. */
  displayName: string | null;
  /** Provides a privacy-preserving email hint when an email exists. */
  obfuscatedEmail: string | null;
  /** Indicates whether Firebase Auth currently disables the account. */
  disabled: boolean;
  /** Indicates whether the user has the moderator custom claim. */
  moderator: boolean;
  /** Supplies the optimistic-concurrency version for the next mutation. */
  auditVersion: number;
  /** Indicates whether the current caller may modify this user. */
  canManage: boolean;
  /** Provides the user's active restriction, when present. */
  restriction: RestrictionView | null;
}

/** Represents immutable, JSON-compatible evidence returned by the audit API. */
export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson };

/** Identifies the user or trusted system that caused an audited change. */
export type AuditActor = { kind: "user"; uid: string } | { kind: "system"; id: "firebase-auth" };

/** Represents one ordered, immutable user-change audit event. */
export interface AuditEvent {
  /** Uniquely identifies the event. */
  id: string;
  /** Identifies the principal that caused the change. */
  actor: AuditActor;
  /** Identifies the user whose state changed. */
  subjectUid: string;
  /** Classifies the trusted operation that produced the event. */
  type: string;
  /** Orders events monotonically within the subject's history. */
  sequence: number;
  /** Records the server instant when the event was committed. */
  occurredAt: IsoTimestamp;
  /** Captures trusted state immediately before the change. */
  before: AuditJson;
  /** Captures trusted state immediately after the change. */
  after: AuditJson;
  /** Explains why an authorized manager made the change, when applicable. */
  reason?: string;
  /** Summarizes changed top-level snapshot sections for display. */
  changedFields?: string[];
}

/** Provides a best-effort display identity for an actor referenced by history. */
export interface AuditIdentity {
  /** Identifies the referenced Firebase Auth user. */
  uid: string;
  /** Provides the user's current display name when available. */
  displayName: string | null;
  /** Provides the user's current email only to authorized viewers. */
  email: string | null;
  /** Indicates that current identity data could not be resolved. */
  unavailable: boolean;
}

/** Contains one newest-first audit page with identity and pagination metadata. */
export interface AuditHistory {
  /** Contains immutable events in descending sequence order. */
  events: AuditEvent[];
  /** Resolves user actors referenced by the returned events. */
  identities: AuditIdentity[];
  /** Supplies the subject's current optimistic-concurrency version. */
  version: number;
  /** Selects the next older page when more events exist. */
  nextBeforeSequence?: number;
}

/** Selects the privileged user attribute used by a management search. */
export type SearchMode = "uid" | "email" | "displayName";

/** Describes a staged restriction to apply through the management callable. */
export interface RestrictionDraft {
  /** Explains the restriction to the affected user. */
  publicReason: string;
  /** Gives authorized managers private context. */
  internalReason?: string;
  /**
   * Sets the exclusive end instant; omission creates a restriction without scheduled expiration.
   * The restriction becomes inactive when server time reaches this instant.
   */
  expiresAt?: IsoTimestamp;
}

/** Describes an optimistic set of staged changes for one managed user. */
export interface ManagementChanges {
  /** Identifies the Firebase Auth user to modify. */
  targetUid: string;
  /** Requires this current audit version before applying changes. */
  expectedVersion: number;
  /** Explains the management action in immutable history. */
  reason: string;
  /** Changes the account's Firebase Auth disabled state when present. */
  disabled?: boolean;
  /** Changes the moderator custom claim when present. */
  moderator?: boolean;
  /** Creates or updates a restriction, or removes it when explicitly `null`. */
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

/** Recognize the canonical UTC form emitted by {@link Date.toISOString}. */
function isIsoTimestamp(value: string): value is IsoTimestamp {
  return /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value);
}

/** Convert a valid date to the canonical timestamp used by callable contracts. */
export function toIsoTimestamp(value: Date): IsoTimestamp {
  const timestamp = value.toISOString();
  if (!isIsoTimestamp(timestamp)) throw new RangeError("Date did not produce an ISO timestamp.");
  return timestamp;
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
