// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

export const SEARCH_RESULT_LIMIT = 10;
export const DISPLAY_NAME_PAGE_LIMIT = 5;
export const AUTH_PAGE_SIZE = 1_000;

import {
  auditableSnapshot,
  changedSnapshotFields,
  type AuditEvent,
  type AuditEventType,
  type AuditOperation,
  type UserAuditStore,
} from "./audit.js";

export type ServiceErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "invalid-argument"
  | "failed-precondition"
  | "not-found"
  | "internal";

/** Represents a client-safe user-management failure and its callable error code. */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;

  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
  }
}

export interface AuthUser {
  uid: string;
  disabled: boolean;
  displayName?: string;
  email?: string;
  photoURL?: string;
  customClaims?: Readonly<Record<string, unknown>>;
}

export interface AuthGateway {
  getUser(uid: string): Promise<AuthUser>;
  getUserByEmail(email: string): Promise<AuthUser>;
  listUsers(
    maxResults: number,
    pageToken?: string,
  ): Promise<{
    users: AuthUser[];
    pageToken?: string;
  }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  updateUser(uid: string, properties: { disabled?: boolean }): Promise<AuthUser>;
}

export interface RestrictionRecord {
  publicReason: string;
  originallyRestrictedBy: string;
  originallyRestrictedAt: Date;
  restrictionLastUpdatedBy: string;
  restrictionLastUpdatedAt: Date;
  expiresAt?: Date;
  invalidExpiration?: true;
}

export interface PrivateUserData {
  internalReason?: string;
}

export interface ModeratorGrantMetadata {
  moderatorGrantedBy: string;
  moderatorGrantedAt: Date;
  moderatorGrantOperationId: string;
}

export interface ManagementStore {
  getRestriction(uid: string): Promise<RestrictionRecord | undefined>;
  getPrivateUserData(uid: string): Promise<PrivateUserData>;
  saveRestriction(
    uid: string,
    restriction: RestrictionRecord,
    internalReason?: string,
  ): Promise<void>;
  removeRestriction(uid: string): Promise<void>;
  writeModeratorGrant(uid: string, metadata: ModeratorGrantMetadata): Promise<void>;
  clearModeratorGrant(uid: string, operationId?: string): Promise<void>;
}

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

export interface ManagedUserView {
  uid: string;
  displayName: string | null;
  obfuscatedEmail: string | null;
  disabled: boolean;
  moderator: boolean;
  auditVersion: number;
  canManage: boolean;
  restriction: RestrictionView | null;
}

export interface AuditIdentityView {
  uid: string;
  displayName: string | null;
  email: string | null;
  unavailable: boolean;
}

export interface AuditHistoryView {
  events: AuditEvent[];
  identities: AuditIdentityView[];
  version: number;
}

export interface SearchUsersInput {
  mode: "uid" | "email" | "displayName";
  query: string;
}

export interface RestrictionInput {
  publicReason: string;
  internalReason?: string;
  expiresAt?: string;
}

export interface ApplyUserManagementInput {
  targetUid: string;
  expectedVersion?: number;
  reason?: string;
  disabled?: boolean;
  moderator?: boolean;
  restriction?: RestrictionInput | null;
}

interface Actor {
  user: AuthUser;
  moderator: boolean;
  operator: boolean;
  operatorUids: ReadonlySet<string>;
  restriction?: RestrictionRecord;
  restricted: boolean;
}

export interface OperatorConfiguration {
  valid: boolean;
  uids: ReadonlySet<string>;
}

/** Strictly parse a deployment-provided JSON array of unique Firebase Auth UIDs. */
export function parseOperatorUids(value: string | undefined): OperatorConfiguration {
  if (value === undefined || value.length === 0) return { valid: false, uids: new Set() };

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { valid: false, uids: new Set() };
    }

    const uids = new Set<string>();
    for (const candidate of parsed) {
      if (
        typeof candidate !== "string" ||
        candidate.length < 1 ||
        candidate.length > 128 ||
        candidate.trim() !== candidate ||
        uids.has(candidate)
      ) {
        return { valid: false, uids: new Set() };
      }
      uids.add(candidate);
    }
    return { valid: true, uids };
  } catch {
    return { valid: false, uids: new Set() };
  }
}

/** Evaluate restriction expiration against an authoritative supplied server time. */
export function isRestrictionActive(
  restriction: RestrictionRecord | undefined,
  now: Date,
): boolean {
  if (restriction === undefined) return false;
  if (restriction.invalidExpiration === true) return true;
  return restriction.expiresAt === undefined || restriction.expiresAt.getTime() > now.getTime();
}

/** Match the web client's established fallback-email obfuscation. */
export function obfuscateEmail(email: string | undefined): string | null {
  const normalized = email?.trim();
  if (!normalized) return null;
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  const localPart = normalized.slice(0, separator);
  const visibleLength = Math.min(2, Math.max(0, localPart.length - 1));
  return `${localPart.slice(0, visibleLength)}…${normalized.slice(separator)}`;
}

/** Preserve unrelated custom claims while adding or removing Moderator authority. */
export function claimsWithModerator(
  claims: Readonly<Record<string, unknown>> | undefined,
  enabled: boolean,
): Record<string, unknown> {
  const updated = { ...claims };
  if (enabled) updated["moderator"] = true;
  else delete updated["moderator"];
  return updated;
}

/**
 * Change the authoritative claim using fail-safe ordering around supplementary metadata.
 * Claims are reloaded immediately before replacement so unrelated values from an earlier
 * request snapshot are not restored. This callable must remain the only application writer
 * of custom claims; the Admin SDK does not provide compare-and-swap claim updates.
 */
export async function changeModeratorClaim(
  auth: AuthGateway,
  store: ManagementStore,
  targetUid: string,
  enabled: boolean,
  actorUid: string,
  now: Date,
  operationId: string,
): Promise<void> {
  const target = await auth.getUser(targetUid);
  const currentlyEnabled = target.customClaims?.["moderator"] === true;
  if (currentlyEnabled === enabled) {
    if (!enabled) {
      try {
        await store.clearModeratorGrant(target.uid);
      } catch {
        // A stale metadata-only grant is harmless because the claim is authoritative.
      }
    }
    return;
  }

  const updatedClaims = claimsWithModerator(target.customClaims, enabled);
  if (enabled) {
    await store.writeModeratorGrant(target.uid, {
      moderatorGrantedBy: actorUid,
      moderatorGrantedAt: now,
      moderatorGrantOperationId: operationId,
    });
    try {
      await auth.setCustomUserClaims(target.uid, updatedClaims);
    } catch (error) {
      try {
        await store.clearModeratorGrant(target.uid, operationId);
      } catch {
        // Cleanup is best effort; metadata cannot grant authority.
      }
      throw error;
    }
    return;
  }

  await auth.setCustomUserClaims(target.uid, updatedClaims);
  try {
    await store.clearModeratorGrant(target.uid);
  } catch {
    // Revocation is already authoritative; stale metadata is harmless.
  }
}

/** Determine whether an unknown input is a non-array record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and normalize a required string received at the callable boundary. */
function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ServiceError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ServiceError(
      "invalid-argument",
      `${field} must contain between 1 and ${maxLength.toString()} characters.`,
    );
  }
  return normalized;
}

/** Validate an optional string, treating null and the empty string as absent. */
function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, maxLength);
}

/** Recognize supported Auth user-not-found error shapes without trusting other errors. */
function isNotFoundError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error["code"] === "string" &&
    (error["code"] === "auth/user-not-found" || error["code"] === "user-not-found")
  );
}

/** Convert persisted restriction values into the serialized callable response shape. */
function restrictionView(
  restriction: RestrictionRecord | undefined,
  internalReason?: string,
): RestrictionView | null {
  if (restriction === undefined) return null;
  return {
    publicReason: restriction.publicReason,
    originallyRestrictedBy: restriction.originallyRestrictedBy,
    originallyRestrictedAt: restriction.originallyRestrictedAt.toISOString(),
    restrictionLastUpdatedBy: restriction.restrictionLastUpdatedBy,
    restrictionLastUpdatedAt: restriction.restrictionLastUpdatedAt.toISOString(),
    expiresAt: restriction.expiresAt?.toISOString() ?? null,
    ...(internalReason === undefined ? {} : { internalReason }),
  };
}

/** Read Moderator authority from the authoritative Auth custom claim. */
function moderatorClaim(user: AuthUser): boolean {
  return user.customClaims?.["moderator"] === true;
}

/** Enforces server-authoritative authorization for user-management operations. */
export class UserManagementService {
  readonly #auth: AuthGateway;
  readonly #store: ManagementStore;
  readonly #operatorConfiguration: () => string | undefined;
  readonly #audit: UserAuditStore | undefined;
  readonly #now: () => Date;
  readonly #operationId: () => string;

  constructor(
    auth: AuthGateway,
    store: ManagementStore,
    operatorConfiguration: () => string | undefined,
    now: () => Date = () => new Date(),
    operationId: () => string = () => crypto.randomUUID(),
    audit?: UserAuditStore,
  ) {
    this.#auth = auth;
    this.#store = store;
    this.#operatorConfiguration = operatorConfiguration;
    this.#now = now;
    this.#operationId = operationId;
    this.#audit = audit;
  }

  /** Resolve current Auth, Operator configuration, and restriction state for a caller. */
  async #actor(uid: string | undefined): Promise<Actor> {
    if (uid === undefined) throw new ServiceError("unauthenticated", "Sign in is required.");

    let user: AuthUser;
    try {
      user = await this.#auth.getUser(uid);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new ServiceError("unauthenticated", "The signed-in account is unavailable.");
      }
      throw error;
    }
    if (user.disabled) {
      throw new ServiceError("permission-denied", "The signed-in account is disabled.");
    }

    const restriction = await this.#store.getRestriction(uid);
    const configuration = parseOperatorUids(this.#operatorConfiguration());
    const operatorUids = configuration.valid ? configuration.uids : new Set<string>();
    return {
      user,
      moderator: moderatorClaim(user),
      operator: operatorUids.has(uid),
      operatorUids,
      ...(restriction === undefined ? {} : { restriction }),
      restricted: isRestrictionActive(restriction, this.#now()),
    };
  }

  /** Return the current server-evaluated authorization view for a caller. */
  async getMyAuthorization(uid: string | undefined): Promise<AuthorizationView> {
    const now = this.#now();
    const actor = await this.#actor(uid);
    const canManageUsers = actor.operator || (actor.moderator && !actor.restricted);
    return {
      moderator: actor.moderator,
      operator: actor.operator,
      restricted: actor.restricted,
      canWriteCommunity: !actor.restricted,
      canManageUsers,
      evaluatedAt: now.toISOString(),
      restriction: actor.restricted ? restrictionView(actor.restriction) : null,
    };
  }

  /** Require active Moderator or Operator authority and return the resolved caller. */
  async #requireManager(uid: string | undefined): Promise<Actor> {
    const actor = await this.#actor(uid);
    if (!actor.operator && (!actor.moderator || actor.restricted)) {
      throw new ServiceError("permission-denied", "Current user-management authority is required.");
    }
    return actor;
  }

  /** Determine whether a caller may manage a target under the role hierarchy. */
  #canManageTarget(actor: Actor, target: AuthUser): boolean {
    return actor.operator || (!actor.operatorUids.has(target.uid) && !moderatorClaim(target));
  }

  /** Build a privacy-preserving management view from authoritative server records. */
  async #managedUser(target: AuthUser, canManage = true): Promise<ManagedUserView> {
    const [restriction, privateData, auditVersion] = await Promise.all([
      this.#store.getRestriction(target.uid),
      this.#store.getPrivateUserData(target.uid),
      this.#audit?.getVersion(target.uid) ?? 0,
    ]);
    const activeRestriction = isRestrictionActive(restriction, this.#now())
      ? restriction
      : undefined;
    return {
      uid: target.uid,
      displayName: target.displayName?.trim() || null,
      obfuscatedEmail: obfuscateEmail(target.email),
      disabled: target.disabled,
      moderator: moderatorClaim(target),
      auditVersion,
      canManage,
      restriction: restrictionView(activeRestriction, privateData.internalReason),
    };
  }

  /** Return a complete online-only history after checking current authority. */
  async getAuditHistory(
    uid: string | undefined,
    targetUidValue: unknown,
  ): Promise<AuditHistoryView> {
    const actor = await this.#requireManager(uid);
    if (this.#audit === undefined)
      throw new ServiceError("internal", "Audit storage is unavailable.");
    const targetUid = requiredString(targetUidValue, "Target UID", 128);
    if (!actor.operator && actor.user.uid === targetUid) {
      throw new ServiceError(
        "permission-denied",
        "Moderators cannot view their own audit history.",
      );
    }
    const [events, version] = await Promise.all([
      this.#audit.listEvents(targetUid),
      this.#audit.getVersion(targetUid),
    ]);
    const userUids = new Set<string>([targetUid]);
    for (const event of events) if (event.actor.kind === "user") userUids.add(event.actor.uid);
    const identities = await Promise.all(
      [...userUids].map(async (identityUid): Promise<AuditIdentityView> => {
        try {
          const user = await this.#auth.getUser(identityUid);
          return {
            uid: identityUid,
            displayName: user.displayName?.trim() || null,
            email: user.email?.trim() || null,
            unavailable: false,
          };
        } catch (error) {
          if (!isNotFoundError(error)) throw error;
          return { uid: identityUid, displayName: null, email: null, unavailable: true };
        }
      }),
    );
    return { events, identities, version };
  }

  /** Search a bounded Auth user set after verifying current management authority. */
  async searchUsers(uid: string | undefined, input: SearchUsersInput): Promise<ManagedUserView[]> {
    const actor = await this.#requireManager(uid);
    if (!isRecord(input)) throw new ServiceError("invalid-argument", "Search input is required.");
    const mode = input["mode"];
    if (mode !== "uid" && mode !== "email" && mode !== "displayName") {
      throw new ServiceError("invalid-argument", "Select a supported search mode.");
    }
    const query = requiredString(input["query"], "Search query", 320);

    let targets: AuthUser[] = [];
    if (mode === "uid") {
      if (query.length > 128) throw new ServiceError("invalid-argument", "UID is too long.");
      try {
        targets = [await this.#auth.getUser(query)];
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    } else if (mode === "email") {
      try {
        targets = [await this.#auth.getUserByEmail(query)];
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    } else {
      const needle = query.toLocaleLowerCase("en-US");
      let pageToken: string | undefined;
      for (let page = 0; page < DISPLAY_NAME_PAGE_LIMIT; page += 1) {
        // Auth pagination is sequential because each response supplies the next page token.
        // oxlint-disable-next-line eslint/no-await-in-loop
        const result = await this.#auth.listUsers(AUTH_PAGE_SIZE, pageToken);
        for (const candidate of result.users) {
          if (candidate.displayName?.toLocaleLowerCase("en-US").includes(needle) === true) {
            targets.push(candidate);
            if (targets.length === SEARCH_RESULT_LIMIT) break;
          }
        }
        if (targets.length === SEARCH_RESULT_LIMIT || result.pageToken === undefined) break;
        pageToken = result.pageToken;
      }
    }

    const visible = targets.slice(0, SEARCH_RESULT_LIMIT);
    return await Promise.all(
      visible.map(
        async (target) => await this.#managedUser(target, this.#canManageTarget(actor, target)),
      ),
    );
  }

  /** Reveal one manageable user's email without persisting it in public data. */
  async revealUserEmail(
    uid: string | undefined,
    targetUidValue: unknown,
  ): Promise<{ email: string | null }> {
    const actor = await this.#requireManager(uid);
    const targetUid = requiredString(targetUidValue, "Target UID", 128);
    let target: AuthUser;
    try {
      target = await this.#auth.getUser(targetUid);
    } catch (error) {
      if (isNotFoundError(error)) throw new ServiceError("not-found", "User not found.");
      throw error;
    }
    if (!this.#canManageTarget(actor, target)) {
      throw new ServiceError("permission-denied", "That user cannot be managed.");
    }
    return { email: target.email ?? null };
  }

  /** Save the caller's public profile and its audit event in one Firestore transaction. */
  async saveMyProfile(
    uid: string | undefined,
    publicNameValue: unknown,
  ): Promise<{ version: number }> {
    const actor = await this.#actor(uid);
    if (this.#audit === undefined)
      throw new ServiceError("internal", "Audit storage is unavailable.");
    if (typeof publicNameValue !== "string") {
      throw new ServiceError("invalid-argument", "Public name must be a string.");
    }
    const publicName = publicNameValue.trim();
    if (publicName.length > 320) {
      throw new ServiceError("invalid-argument", "Public name must not exceed 320 characters.");
    }
    const now = this.#now();
    const [profile, restriction, privateData, expectedVersion] = await Promise.all([
      this.#audit.readProfile(actor.user.uid),
      this.#store.getRestriction(actor.user.uid),
      this.#store.getPrivateUserData(actor.user.uid),
      this.#audit.getVersion(actor.user.uid),
    ]);
    const currentPublicName =
      typeof profile === "object" && profile !== null && !Array.isArray(profile)
        ? Reflect.get(profile, "publicName")
        : undefined;
    if (currentPublicName === publicName) return { version: expectedVersion };

    const operation = {
      id: this.#operationId(),
      subjectUid: actor.user.uid,
      expectedVersion,
    };
    const before = auditableSnapshot(actor.user, profile, restriction, privateData);
    const nextProfile = { publicName, updatedAt: now.toISOString() };
    const after = auditableSnapshot(actor.user, nextProfile, restriction, privateData);
    await this.#audit.beginOperation(operation);
    try {
      await this.#audit.completeProfileOperation(
        operation,
        {
          id: operation.id,
          actor: { kind: "user", uid: actor.user.uid },
          subjectUid: actor.user.uid,
          type: "profile.updated",
          before,
          after,
          changedFields: changedSnapshotFields(before, after),
        },
        publicName,
        now,
      );
    } catch (error) {
      await this.#audit.cancelOperation(operation);
      throw error;
    }
    return { version: expectedVersion + 1 };
  }

  /** Apply one logical, versioned management operation and append one audit event. */
  async applyUserManagement(
    uid: string | undefined,
    input: ApplyUserManagementInput,
  ): Promise<ManagedUserView> {
    const actor = await this.#requireManager(uid);
    if (!isRecord(input))
      throw new ServiceError("invalid-argument", "Management input is required.");
    const targetUid = requiredString(input["targetUid"], "Target UID", 128);
    const requestedDisabled = input["disabled"];
    const requestedModerator = input["moderator"];
    const requestedRestriction = input["restriction"];
    if (requestedDisabled !== undefined && typeof requestedDisabled !== "boolean") {
      throw new ServiceError("invalid-argument", "Disabled must be true or false.");
    }
    if (requestedModerator !== undefined && typeof requestedModerator !== "boolean") {
      throw new ServiceError("invalid-argument", "Moderator must be true or false.");
    }
    if (
      requestedDisabled === undefined &&
      requestedModerator === undefined &&
      requestedRestriction === undefined
    ) {
      throw new ServiceError("invalid-argument", "No management changes were supplied.");
    }
    if ((requestedDisabled !== undefined || requestedModerator !== undefined) && !actor.operator) {
      throw new ServiceError(
        "permission-denied",
        "Only an Operator can change disabled or Moderator status.",
      );
    }

    let target: AuthUser;
    try {
      target = await this.#auth.getUser(targetUid);
    } catch (error) {
      if (isNotFoundError(error)) throw new ServiceError("not-found", "User not found.");
      throw error;
    }
    if (!this.#canManageTarget(actor, target)) {
      throw new ServiceError(
        "permission-denied",
        "Moderators cannot manage another Moderator or Operator.",
      );
    }

    const now = this.#now();
    const [existingRestriction, existingPrivateData] = await Promise.all([
      this.#store.getRestriction(targetUid),
      this.#store.getPrivateUserData(targetUid),
    ]);
    const activeExisting = isRestrictionActive(existingRestriction, now)
      ? existingRestriction
      : undefined;
    let plannedRestriction:
      | { record: RestrictionRecord; internalReason?: string }
      | null
      | undefined;
    if (requestedRestriction === null) {
      plannedRestriction = null;
    } else if (requestedRestriction !== undefined) {
      if (!isRecord(requestedRestriction)) {
        throw new ServiceError("invalid-argument", "Restriction must be an object or null.");
      }
      const publicReason = requiredString(
        requestedRestriction["publicReason"],
        "User-visible reason",
        500,
      );
      const internalReason = optionalString(
        requestedRestriction["internalReason"],
        "Internal reason",
        2_000,
      );
      const expiresAtValue = optionalString(requestedRestriction["expiresAt"], "Expiration", 64);
      let expiresAt: Date | undefined;
      if (expiresAtValue !== undefined) {
        expiresAt = new Date(expiresAtValue);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
          throw new ServiceError("invalid-argument", "Expiration must be a future date and time.");
        }
      }
      plannedRestriction = {
        record: {
          publicReason,
          originallyRestrictedBy: activeExisting?.originallyRestrictedBy ?? actor.user.uid,
          originallyRestrictedAt: activeExisting?.originallyRestrictedAt ?? now,
          restrictionLastUpdatedBy: actor.user.uid,
          restrictionLastUpdatedAt: now,
          ...(expiresAt === undefined ? {} : { expiresAt }),
        },
        ...(internalReason === undefined ? {} : { internalReason }),
      };
    }

    const restrictionChanged =
      plannedRestriction !== undefined &&
      (plannedRestriction === null
        ? activeExisting !== undefined
        : activeExisting === undefined ||
          plannedRestriction.record.publicReason !== activeExisting.publicReason ||
          plannedRestriction.internalReason !== existingPrivateData.internalReason ||
          plannedRestriction.record.expiresAt?.getTime() !== activeExisting.expiresAt?.getTime());
    const moderatorChanged =
      requestedModerator !== undefined && requestedModerator !== moderatorClaim(target);
    const disabledChanged =
      requestedDisabled !== undefined && requestedDisabled !== target.disabled;
    if (!restrictionChanged && !moderatorChanged && !disabledChanged) {
      throw new ServiceError("invalid-argument", "The request does not change current user state.");
    }

    let operation: AuditOperation | undefined;
    let beforeSnapshot;
    if (this.#audit !== undefined) {
      const expectedVersion = input["expectedVersion"];
      if (
        typeof expectedVersion !== "number" ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0
      ) {
        throw new ServiceError("invalid-argument", "A valid audit version is required.");
      }
      const reason = requiredString(input["reason"], "Action reason", 2_000);
      const id = this.#operationId();
      operation = { id, subjectUid: targetUid, expectedVersion };
      beforeSnapshot = auditableSnapshot(
        target,
        await this.#audit.readProfile(targetUid),
        activeExisting,
        existingPrivateData,
      );
      await this.#audit.beginOperation(operation);
      // Validate now so malformed reasons cannot leave a pending operation.
      void reason;
    }

    let persistedChange = false;
    try {
      if (plannedRestriction !== undefined && plannedRestriction !== null) {
        await this.#store.saveRestriction(
          targetUid,
          plannedRestriction.record,
          plannedRestriction.internalReason,
        );
        persistedChange = true;
      }
      if (requestedModerator !== undefined && moderatorChanged) {
        await changeModeratorClaim(
          this.#auth,
          this.#store,
          target.uid,
          requestedModerator,
          actor.user.uid,
          now,
          this.#operationId(),
        );
        persistedChange = true;
      }
      if (requestedDisabled !== undefined && disabledChanged) {
        await this.#auth.updateUser(targetUid, { disabled: requestedDisabled });
        persistedChange = true;
      }
      if (plannedRestriction === null && restrictionChanged) {
        await this.#store.removeRestriction(targetUid);
        persistedChange = true;
      }
    } catch (error) {
      if (operation !== undefined && !persistedChange) {
        await this.#audit?.cancelOperation(operation);
      }
      throw error;
    }

    const confirmedTarget = await this.#auth.getUser(targetUid);
    if (operation !== undefined && beforeSnapshot !== undefined && this.#audit !== undefined) {
      const [confirmedRestriction, confirmedPrivateData, profile] = await Promise.all([
        this.#store.getRestriction(targetUid),
        this.#store.getPrivateUserData(targetUid),
        this.#audit.readProfile(targetUid),
      ]);
      const afterSnapshot = auditableSnapshot(
        confirmedTarget,
        profile,
        isRestrictionActive(confirmedRestriction, now) ? confirmedRestriction : undefined,
        confirmedPrivateData,
      );
      let type: AuditEventType = "user.management-updated";
      const changeCount =
        Number(restrictionChanged) + Number(moderatorChanged) + Number(disabledChanged);
      if (changeCount === 1 && restrictionChanged) {
        type =
          activeExisting === undefined
            ? "user.restricted"
            : plannedRestriction === null
              ? "user.unrestricted"
              : "user.restriction-updated";
      } else if (changeCount === 1 && moderatorChanged) {
        type = requestedModerator ? "user.moderator-promoted" : "user.moderator-demoted";
      } else if (changeCount === 1 && disabledChanged) {
        type = requestedDisabled ? "user.disabled" : "user.enabled";
      }
      await this.#audit.completeOperation(
        operation,
        {
          id: operation.id,
          actor: { kind: "user", uid: actor.user.uid },
          subjectUid: targetUid,
          type,
          before: beforeSnapshot,
          after: afterSnapshot,
          reason: requiredString(input["reason"], "Action reason", 2_000),
          changedFields: changedSnapshotFields(beforeSnapshot, afterSnapshot),
        },
        now,
      );
    }
    return await this.#managedUser(confirmedTarget);
  }
}
