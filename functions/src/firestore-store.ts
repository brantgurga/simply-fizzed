import { FieldValue, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { isRestrictionActive } from "./management.js";
import type {
  ManagementStore,
  ModeratorGrantMetadata,
  PrivateUserData,
  RestrictionRecord,
} from "./management.js";

export const RESTRICTIONS_COLLECTION = "restrictions";
export const USER_MODERATION_COLLECTION = "userModeration";

function timestampDate(value: unknown): Date | undefined {
  return value instanceof Timestamp ? value.toDate() : undefined;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function restrictionFromData(data: DocumentData): RestrictionRecord {
  const originalAt = timestampDate(data["originallyRestrictedAt"]) ?? new Date(0);
  const updatedAt = timestampDate(data["restrictionLastUpdatedAt"]) ?? originalAt;
  const hasExpiration = Object.hasOwn(data, "expiresAt");
  const expiresAt = hasExpiration ? timestampDate(data["expiresAt"]) : undefined;
  return {
    publicReason: safeString(data["publicReason"], "Community access is restricted."),
    originallyRestrictedBy: safeString(data["originallyRestrictedBy"], "unknown"),
    originallyRestrictedAt: originalAt,
    restrictionLastUpdatedBy: safeString(data["restrictionLastUpdatedBy"], "unknown"),
    restrictionLastUpdatedAt: updatedAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(hasExpiration && expiresAt === undefined ? { invalidExpiration: true as const } : {}),
  };
}

/** Firestore adapter for authoritative restrictions and private supplementary metadata. */
export class FirestoreManagementStore implements ManagementStore {
  readonly #db: Firestore;

  constructor(db: Firestore) {
    this.#db = db;
  }

  async getRestriction(uid: string): Promise<RestrictionRecord | undefined> {
    const snapshot = await this.#db.collection(RESTRICTIONS_COLLECTION).doc(uid).get();
    if (!snapshot.exists) return undefined;
    return restrictionFromData(snapshot.data() ?? {});
  }

  async getPrivateUserData(uid: string): Promise<PrivateUserData> {
    const snapshot = await this.#db.collection(USER_MODERATION_COLLECTION).doc(uid).get();
    const internalReason = snapshot.exists ? snapshot.get("internalReason") : undefined;
    return typeof internalReason === "string" && internalReason.length > 0
      ? { internalReason }
      : {};
  }

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
        ? restrictionFromData(publicSnapshot.data() ?? {})
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

  async writeModeratorGrant(uid: string, metadata: ModeratorGrantMetadata): Promise<void> {
    await this.#db.collection(USER_MODERATION_COLLECTION).doc(uid).set(metadata, { merge: true });
  }

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
