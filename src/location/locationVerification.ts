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

export function parseVerification(data: unknown): Verification | undefined {
  const parsed = verificationDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/** Sort newest action time first, then lower UID first for equal timestamps. */
export function compareVerifications(left: Verification, right: Verification): number {
  const timeDifference = right.verifiedAt.getTime() - left.verifiedAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  if (left.verifiedBy === right.verifiedBy) return 0;
  return left.verifiedBy < right.verifiedBy ? -1 : 1;
}

export async function loadLatestVerification(
  db: Firestore,
  locationId: string,
): Promise<VerificationLoad> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.verifications),
      where("locationId", "==", locationId),
      orderBy("verifiedAt", "desc"),
      orderBy("verifiedBy", "asc"),
      limit(20),
    ),
  );
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

/** Queue an append-only verification event using the time of the user's action. */
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
