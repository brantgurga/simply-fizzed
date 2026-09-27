import {
  addDoc,
  collection,
  type Firestore,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  COLLECTIONS,
  type Verification,
  verificationDocumentSchema,
  verificationWriteSchema,
} from "../model/firestore";
import type { QueuedWrite } from "../availability/addAvailability";

export interface VerificationContributor {
  id: string;
  name?: string;
}

export interface VerificationLoad {
  latest?: Verification;
  malformedCount: number;
}

/**
 * Parses untrusted Firestore verification data.
 * Returns `undefined` instead of throwing when the document is malformed.
 */
export function parseVerification(data: unknown): Verification | undefined {
  const parsed = verificationDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Compares verifications newest-first, using ascending contributor UID for equal action times.
 * Suitable for `Array.prototype.sort` and `toSorted`.
 */
export function compareVerifications(left: Verification, right: Verification): number {
  const timeDifference = right.verifiedAt.getTime() - left.verifiedAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  if (left.verifiedBy === right.verifiedBy) return 0;
  return left.verifiedBy < right.verifiedBy ? -1 : 1;
}

/**
 * Loads the latest valid verification for a location and counts malformed candidates.
 *
 * Returns no verification while the required composite index is unavailable, allowing the
 * location's primary content to remain usable during index provisioning.
 *
 * @throws When the Firestore query fails for a reason other than an unavailable index.
 */
export async function loadLatestVerification(
  db: Firestore,
  locationId: string,
): Promise<VerificationLoad> {
  let snapshot;
  try {
    snapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.verifications),
        where("locationId", "==", locationId),
        orderBy("verifiedAt", "desc"),
        orderBy("verifiedBy", "asc"),
        limit(20),
      ),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "failed-precondition"
    ) {
      return { malformedCount: 0 };
    }
    throw error;
  }
  const valid: Verification[] = [];
  let malformedCount = 0;
  for (const item of snapshot.docs) {
    const verification = parseVerification(item.data());
    if (verification === undefined) malformedCount += 1;
    else valid.push(verification);
  }
  valid.sort(compareVerifications);
  return { ...(valid[0] === undefined ? {} : { latest: valid[0] }), malformedCount };
}

/**
 * Queues an append-only location verification using the user's action time.
 *
 * The returned value can be displayed optimistically; await `committed` for server acceptance.
 * Contributor names are trimmed and omitted names become an empty public attribution.
 *
 * @throws When the location, attribution, or action time is invalid.
 */
export function confirmLocationAvailability(
  db: Firestore,
  locationId: string,
  contributor: VerificationContributor,
  actionTime = new Date(),
): QueuedWrite<Verification> {
  const value = verificationWriteSchema.parse({
    locationId,
    verifiedBy: contributor.id,
    verifiedByName: contributor.name?.trim() || "",
    verifiedAt: actionTime,
  });
  const committed = addDoc(collection(db, COLLECTIONS.verifications), {
    ...value,
    verifiedAt: Timestamp.fromDate(actionTime),
  }).then(() => undefined);
  return { value, committed };
}
