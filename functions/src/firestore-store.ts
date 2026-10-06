// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { FieldValue, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import * as z from "zod/mini";
import { isRestrictionActive } from "./management.js";
import type {
  ManagementStore,
  ModeratorGrantMetadata,
  PrivateUserData,
  RestrictionRecord,
} from "./management.js";

export const RESTRICTIONS_COLLECTION = "restrictions";
export const USER_MODERATION_COLLECTION = "userModeration";

const nonEmptyStringSchema = z.string().check(z.minLength(1));
const adminTimestampSchema = z.pipe(
  z.transform((value: unknown) => (value instanceof Timestamp ? value.toDate() : undefined)),
  z.date(),
);

/** Create a schema that replaces invalid persisted strings with a fail-safe value. */
function stringWithFallback(fallback: string) {
  return z.pipe(
    z.unknown(),
    z.transform((value) => {
      const parsed = nonEmptyStringSchema.safeParse(value);
      return parsed.success ? parsed.data : fallback;
    }),
  );
}

/** Create a schema that replaces invalid timestamps with a fail-safe date. */
function dateWithFallback(fallback: Date) {
  return z.pipe(
    z.unknown(),
    z.transform((value) => {
      const parsed = adminTimestampSchema.safeParse(value);
      return parsed.success ? parsed.data : fallback;
    }),
  );
}

const optionalTimestampSchema = z.pipe(
  z.unknown(),
  z.transform((value) => {
    const parsed = adminTimestampSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }),
);

/** Runtime schema for an untrusted authoritative restriction document. */
export const restrictionDocumentSchema = z.pipe(
  z.transform((value: unknown) => {
    const data = typeof value === "object" && value !== null ? value : {};
    return {
      publicReason: Reflect.get(data, "publicReason"),
      originallyRestrictedBy: Reflect.get(data, "originallyRestrictedBy"),
      originallyRestrictedAt: Reflect.get(data, "originallyRestrictedAt"),
      restrictionLastUpdatedBy: Reflect.get(data, "restrictionLastUpdatedBy"),
      restrictionLastUpdatedAt: Reflect.get(data, "restrictionLastUpdatedAt"),
      expiresAt: Reflect.get(data, "expiresAt"),
      hasExpiration: Object.hasOwn(data, "expiresAt"),
    };
  }),
  z.pipe(
    z.object({
      publicReason: stringWithFallback("Community access is restricted."),
      originallyRestrictedBy: stringWithFallback("unknown"),
      originallyRestrictedAt: dateWithFallback(new Date(0)),
      restrictionLastUpdatedBy: stringWithFallback("unknown"),
      restrictionLastUpdatedAt: optionalTimestampSchema,
      expiresAt: optionalTimestampSchema,
      hasExpiration: z.boolean(),
    }),
    z.transform((data): RestrictionRecord => {
      const restrictionLastUpdatedAt = data.restrictionLastUpdatedAt ?? data.originallyRestrictedAt;
      return {
        publicReason: data.publicReason,
        originallyRestrictedBy: data.originallyRestrictedBy,
        originallyRestrictedAt: data.originallyRestrictedAt,
        restrictionLastUpdatedBy: data.restrictionLastUpdatedBy,
        restrictionLastUpdatedAt,
        ...(data.expiresAt === undefined ? {} : { expiresAt: data.expiresAt }),
        ...(data.hasExpiration && data.expiresAt === undefined
          ? { invalidExpiration: true as const }
          : {}),
      };
    }),
  ),
);

/** Runtime schema for untrusted supplementary private moderation data. */
export const privateUserDataDocumentSchema = z.pipe(
  z.transform((value: unknown) => ({
    internalReason:
      typeof value === "object" && value !== null
        ? Reflect.get(value, "internalReason")
        : undefined,
  })),
  z.pipe(
    z.object({ internalReason: stringWithFallback("") }),
    z.transform(({ internalReason }): PrivateUserData =>
      internalReason.length > 0 ? { internalReason } : {},
    ),
  ),
);

/** Firestore adapter for authoritative restrictions and private supplementary metadata. */
export class FirestoreManagementStore implements ManagementStore {
  readonly #db: Firestore;

  constructor(db: Firestore) {
    this.#db = db;
  }

  /** Read one authoritative restriction by Firebase Auth UID. */
  async getRestriction(uid: string): Promise<RestrictionRecord | undefined> {
    const snapshot = await this.#db.collection(RESTRICTIONS_COLLECTION).doc(uid).get();
    if (!snapshot.exists) return undefined;
    return restrictionDocumentSchema.parse(snapshot.data() ?? {});
  }

  /** Read supplementary moderation data that cannot grant or restrict authority. */
  async getPrivateUserData(uid: string): Promise<PrivateUserData> {
    const snapshot = await this.#db.collection(USER_MODERATION_COLLECTION).doc(uid).get();
    return privateUserDataDocumentSchema.parse(snapshot.data() ?? {});
  }

  /** Atomically save authoritative restriction state and supplementary private context. */
  async saveRestriction(
    uid: string,
    restriction: RestrictionRecord,
    internalReason?: string,
  ): Promise<void> {
    const publicReference = this.#db.collection(RESTRICTIONS_COLLECTION).doc(uid);
    const privateReference = this.#db.collection(USER_MODERATION_COLLECTION).doc(uid);
    await this.#db.runTransaction(async (transaction) => {
      const publicSnapshot = await transaction.get(publicReference);
      const privateSnapshot = await transaction.get(privateReference);
      const current = publicSnapshot.exists
        ? restrictionDocumentSchema.parse(publicSnapshot.data() ?? {})
        : undefined;
      const activeCurrent = isRestrictionActive(current, restriction.restrictionLastUpdatedAt)
        ? current
        : undefined;
      const publicData: DocumentData = {
        publicReason: restriction.publicReason,
        originallyRestrictedBy:
          activeCurrent?.originallyRestrictedBy ?? restriction.originallyRestrictedBy,
        originallyRestrictedAt:
          activeCurrent?.originallyRestrictedAt ?? restriction.originallyRestrictedAt,
        restrictionLastUpdatedBy: restriction.restrictionLastUpdatedBy,
        restrictionLastUpdatedAt: restriction.restrictionLastUpdatedAt,
        ...(restriction.expiresAt === undefined ? {} : { expiresAt: restriction.expiresAt }),
      };
      transaction.set(publicReference, publicData);
      if (internalReason !== undefined) {
        transaction.set(privateReference, { internalReason }, { merge: true });
      } else if (privateSnapshot.exists && privateSnapshot.get("internalReason") !== undefined) {
        transaction.update(privateReference, { internalReason: FieldValue.delete() });
      }
    });
  }

  /** Atomically remove authoritative restriction state and its private reason. */
  async removeRestriction(uid: string): Promise<void> {
    const publicReference = this.#db.collection(RESTRICTIONS_COLLECTION).doc(uid);
    const privateReference = this.#db.collection(USER_MODERATION_COLLECTION).doc(uid);
    await this.#db.runTransaction(async (transaction) => {
      const privateSnapshot = await transaction.get(privateReference);
      transaction.delete(publicReference);
      if (!privateSnapshot.exists || privateSnapshot.get("internalReason") === undefined) return;
      const remaining = Object.keys(privateSnapshot.data() ?? {}).filter(
        (field) => field !== "internalReason",
      );
      if (remaining.length === 0) transaction.delete(privateReference);
      else transaction.update(privateReference, { internalReason: FieldValue.delete() });
    });
  }

  /** Write supplementary attribution before granting the authoritative Moderator claim. */
  async writeModeratorGrant(uid: string, metadata: ModeratorGrantMetadata): Promise<void> {
    await this.#db.collection(USER_MODERATION_COLLECTION).doc(uid).set(metadata, { merge: true });
  }

  /** Remove supplementary grant attribution, optionally only for a matching operation. */
  async clearModeratorGrant(uid: string, operationId?: string): Promise<void> {
    const reference = this.#db.collection(USER_MODERATION_COLLECTION).doc(uid);
    await this.#db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      if (operationId !== undefined && snapshot.get("moderatorGrantOperationId") !== operationId) {
        return;
      }
      const data = snapshot.data() ?? {};
      const grantFields = new Set([
        "moderatorGrantedBy",
        "moderatorGrantedAt",
        "moderatorGrantOperationId",
      ]);
      const remaining = Object.keys(data).filter((field) => !grantFields.has(field));
      if (remaining.length === 0) transaction.delete(reference);
      else {
        transaction.update(reference, {
          moderatorGrantedBy: FieldValue.delete(),
          moderatorGrantedAt: FieldValue.delete(),
          moderatorGrantOperationId: FieldValue.delete(),
        });
      }
    });
  }
}
