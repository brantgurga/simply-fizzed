import { collection, doc, type Firestore, getDoc, getDocs, query, where } from "firebase/firestore";
import { COLLECTIONS, type Availability } from "../model/firestore";
import { groupAvailabilityByLocation, parseAvailability, parseLocation } from "../nearby/results";
import type { LocationDoc } from "../nearby/distance";
import type { DocumentLoad } from "../soda/sodas";

export interface AvailabilityLoad {
  items: Availability[];
  malformedCount: number;
  latestUpdatedAt?: Date;
}

/**
 * Returns the newest known availability action time, ignoring undated legacy records.
 * Returns `undefined` when no item has an update timestamp.
 */
export function latestAvailabilityUpdate(items: readonly Availability[]): Date | undefined {
  let latest: Date | undefined;
  for (const item of items) {
    if (item.updatedAt !== undefined && (latest === undefined || item.updatedAt > latest)) {
      latest = item.updatedAt;
    }
  }
  return latest;
}

export async function loadLocation(db: Firestore, id: string): Promise<DocumentLoad<LocationDoc>> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.locations, id));
  if (!snapshot.exists()) return { status: "missing" };
  const location = parseLocation(snapshot.id, snapshot.data());
  return location === undefined ? { status: "malformed" } : { status: "found", value: location };
}

export async function loadLocationAvailability(
  db: Firestore,
  locationId: string,
): Promise<AvailabilityLoad> {
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.availability), where("locationId", "==", locationId)),
  );
  const items: Availability[] = [];
  let malformedCount = 0;
  for (const item of snapshot.docs) {
    const availability = parseAvailability(item.data());
    if (availability === undefined) malformedCount += 1;
    else items.push({ ...availability, documentId: item.id });
  }
  const locationItems = groupAvailabilityByLocation(items).get(locationId) ?? [];
  const latestUpdatedAt = latestAvailabilityUpdate(locationItems);
  return {
    items: locationItems,
    malformedCount,
    ...(latestUpdatedAt === undefined ? {} : { latestUpdatedAt }),
  };
}
