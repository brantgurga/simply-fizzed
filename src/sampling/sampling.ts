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
  samplingDocumentSchema,
  type MugRating,
  type ProfileDocument,
  type SamplingDocument,
} from "../model/firestore";
import type { SodaDocument } from "../soda/sodas";

export interface Sampling extends SamplingDocument {
  id: string;
}

export interface PublicProfile extends ProfileDocument {
  id: string;
}

export type SamplingLoad =
  | { status: "found"; value: Sampling }
  | { status: "missing" }
  | { status: "malformed" };

export type InventoryLoad =
  | { status: "found"; profile: PublicProfile; samplings: Sampling[] }
  | { status: "missing" }
  | { status: "malformed" };

export type SamplingValue = MugRating | null | undefined;

function parseSampling(id: string, value: unknown): Sampling | undefined {
  const parsed = samplingDocumentSchema.safeParse(value);
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

/** Load the signed-in user's sampling for one soda offering. */
export async function loadSampling(
  db: Firestore,
  userId: string,
  sodaOfferingId: string,
): Promise<SamplingLoad> {
  const snapshot = await getDoc(
    doc(db, COLLECTIONS.profiles, userId, COLLECTIONS.samplings, sodaOfferingId),
  );
  if (!snapshot.exists()) return { status: "missing" };
  const sampling = parseSampling(snapshot.id, snapshot.data());
  return sampling === undefined ? { status: "malformed" } : { status: "found", value: sampling };
}

/**
 * Persist the complete sampling state. Undefined removes it, null records an
 * unrated sampling, and a number records a whole-mug rating.
 */
export async function saveSampling(
  db: Firestore,
  userId: string,
  publicName: string,
  soda: SodaDocument,
  value: SamplingValue,
): Promise<void> {
  const profileReference = doc(db, COLLECTIONS.profiles, userId);
  const samplingReference = doc(db, COLLECTIONS.profiles, userId, COLLECTIONS.samplings, soda.id);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(samplingReference);
    transaction.set(
      profileReference,
      { publicName, updatedAt: serverTimestamp() },
      { merge: true },
    );

    if (value === undefined) {
      if (existing.exists()) transaction.delete(samplingReference);
      return;
    }

    transaction.set(
      samplingReference,
      {
        userId,
        sodaOfferingId: soda.id,
        sodaName: soda.name,
        sodaBrand: soda.brand,
        sodaFlavor: soda.flavor,
        rating: value,
        ...(!existing.exists() ? { firstRecorded: serverTimestamp() } : {}),
        lastRatedAt: value === null ? null : serverTimestamp(),
      },
      { merge: existing.exists() },
    );
  });
}

/** Load a public profile and every sampled offering in its inventory. */
export async function loadInventory(db: Firestore, userId: string): Promise<InventoryLoad> {
  const profileReference = doc(db, COLLECTIONS.profiles, userId);
  const [profileSnapshot, samplingSnapshot] = await Promise.all([
    getDoc(profileReference),
    getDocs(collection(profileReference, COLLECTIONS.samplings)),
  ]);
  if (!profileSnapshot.exists()) return { status: "missing" };

  const parsedProfile = profileDocumentSchema.safeParse(profileSnapshot.data());
  if (!parsedProfile.success) return { status: "malformed" };

  const samplings = samplingSnapshot.docs.map((item) => parseSampling(item.id, item.data()));
  if (samplings.some((sampling) => sampling === undefined)) return { status: "malformed" };

  return {
    status: "found",
    profile: { id: profileSnapshot.id, ...parsedProfile.data },
    samplings: samplings.filter((sampling): sampling is Sampling => sampling !== undefined),
  };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });
const offeringLabel = (sampling: Sampling) =>
  `${sampling.sodaBrand} ${sampling.sodaName} — ${sampling.sodaFlavor}`;
const compareRecordIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Default inventory order: offering label, then stable record ID. */
export function compareAlphabetically(left: Sampling, right: Sampling): number {
  return (
    collator.compare(offeringLabel(left), offeringLabel(right)) ||
    compareRecordIds(left.id, right.id)
  );
}

/** Rated first by rating time, then unrated by first-recorded time. */
export function compareRecentlyRated(left: Sampling, right: Sampling): number {
  if (left.rating !== null && right.rating === null) return -1;
  if (left.rating === null && right.rating !== null) return 1;

  const leftTime = (left.lastRatedAt ?? left.firstRecorded).getTime();
  const rightTime = (right.lastRatedAt ?? right.firstRecorded).getTime();
  return rightTime - leftTime || compareRecordIds(left.id, right.id);
}
