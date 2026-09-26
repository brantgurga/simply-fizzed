import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import {
  COLLECTIONS,
  profileDocumentSchema,
  ratingDocumentSchema,
  type MugRating,
  type ProfileDocument,
  type RatingDocument,
} from "../model/firestore";
import type { SodaDocument } from "../soda/sodas";

export interface RatingRecord extends RatingDocument {
  id: string;
}

export interface PublicProfile extends ProfileDocument {
  id: string;
}

export type RatingLoad =
  | { status: "found"; value: RatingRecord }
  | { status: "missing" }
  | { status: "malformed" };

export type InventoryLoad =
  | { status: "found"; profile: PublicProfile; ratings: RatingRecord[] }
  | { status: "missing" }
  | { status: "malformed" };

export type RatingValue = MugRating | null | undefined;

function parseRating(id: string, value: unknown): RatingRecord | undefined {
  const parsed = ratingDocumentSchema.safeParse(value);
  return parsed.success ? { id, ...parsed.data } : undefined;
}

/** Ensure every authenticated account has a current public profile. */
export async function savePublicProfile(
  db: Firestore,
  userId: string,
  publicName: string,
): Promise<void> {
  const reference = doc(db, COLLECTIONS.profiles, userId);
  const snapshot = await getDoc(reference);
  const existing = snapshot.exists() ? profileDocumentSchema.safeParse(snapshot.data()) : undefined;
  if (existing?.success === true && existing.data.publicName === publicName) return;
  await setDoc(reference, { publicName, updatedAt: serverTimestamp() }, { merge: true });
}

/** Load the signed-in user's rating record for one soda offering. */
export async function loadRating(
  db: Firestore,
  userId: string,
  sodaOfferingId: string,
): Promise<RatingLoad> {
  const snapshot = await getDoc(
    doc(db, COLLECTIONS.profiles, userId, COLLECTIONS.ratings, sodaOfferingId),
  );
  if (!snapshot.exists()) return { status: "missing" };
  const rating = parseRating(snapshot.id, snapshot.data());
  return rating === undefined ? { status: "malformed" } : { status: "found", value: rating };
}

/**
 * Persist the complete rating state. Undefined removes it, null records an
 * unrated sampled offering, and a number records its mug rating.
 */
export async function saveRating(
  db: Firestore,
  userId: string,
  publicName: string,
  soda: SodaDocument,
  value: RatingValue,
): Promise<void> {
  const profileReference = doc(db, COLLECTIONS.profiles, userId);
  const ratingReference = doc(db, COLLECTIONS.profiles, userId, COLLECTIONS.ratings, soda.id);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ratingReference);
    transaction.set(
      profileReference,
      { publicName, updatedAt: serverTimestamp() },
      { merge: true },
    );

    if (value === undefined) {
      if (existing.exists()) transaction.delete(ratingReference);
      return;
    }

    const ratingFields = {
      rating: value,
      lastRatedAt: value === null ? null : serverTimestamp(),
    };
    if (existing.exists()) {
      transaction.update(ratingReference, ratingFields);
    } else {
      transaction.set(ratingReference, {
        userId,
        sodaOfferingId: soda.id,
        sodaName: soda.name,
        sodaBrand: soda.brand,
        sodaFlavor: soda.flavor,
        firstRecorded: serverTimestamp(),
        ...ratingFields,
      });
    }
  });
}

/** Load a public profile and every rating record in its sampled inventory. */
export async function loadInventory(db: Firestore, userId: string): Promise<InventoryLoad> {
  const profileReference = doc(db, COLLECTIONS.profiles, userId);
  const [profileSnapshot, ratingSnapshot] = await Promise.all([
    getDoc(profileReference),
    getDocs(collection(profileReference, COLLECTIONS.ratings)),
  ]);
  if (!profileSnapshot.exists()) return { status: "missing" };

  const parsedProfile = profileDocumentSchema.safeParse(profileSnapshot.data());
  if (!parsedProfile.success) return { status: "malformed" };

  const ratings = ratingSnapshot.docs.map((item) => parseRating(item.id, item.data()));
  if (ratings.some((rating) => rating === undefined)) return { status: "malformed" };

  return {
    status: "found",
    profile: { id: profileSnapshot.id, ...parsedProfile.data },
    ratings: ratings.filter((rating): rating is RatingRecord => rating !== undefined),
  };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });
export const sodaOfferingLabel = (rating: RatingRecord) =>
  `${rating.sodaBrand} ${rating.sodaName} (${rating.sodaFlavor})`;
const compareRecordIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Default inventory order: offering label, then stable record ID. */
export function compareAlphabetically(left: RatingRecord, right: RatingRecord): number {
  return (
    collator.compare(sodaOfferingLabel(left), sodaOfferingLabel(right)) ||
    compareRecordIds(left.id, right.id)
  );
}

/** Rated first by rating time, then unrated by first-recorded time. */
export function compareRecentlyRated(left: RatingRecord, right: RatingRecord): number {
  if (left.rating !== null && right.rating === null) return -1;
  if (left.rating === null && right.rating !== null) return 1;

  const leftTime = (left.lastRatedAt ?? left.firstRecorded).getTime();
  const rightTime = (right.lastRatedAt ?? right.firstRecorded).getTime();
  return rightTime - leftTime || compareRecordIds(left.id, right.id);
}
