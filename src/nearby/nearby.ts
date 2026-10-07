// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// The Firestore side of nearby search: query `locations` by geohash bounds for a
// 60-mile radius, batch-load `availability` for the in-radius locations, and
// combine everything into ranked `NearbyLocation` results. The distance math and
// document parsing it relies on live in the pure modules `distance.ts` and
// `results.ts` so they can be unit tested without a database.
import {
  collection,
  endAt,
  type Firestore,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
} from "firebase/firestore";
import { geohashQueryBounds } from "geofire-common";
import { type Availability, COLLECTIONS, type GeoPoint } from "../model/firestore";
import { chunk, type LocationDoc, rankByDistance, SEARCH_RADIUS_METERS } from "./distance";
import {
  groupAvailabilityByLocation,
  type NearbyLocation,
  parseAvailability,
  parseLocation,
} from "./results";

// Firestore caps an `in` filter at 30 comparison values, so availability lookups
// are batched into chunks of this size.
const AVAILABILITY_IN_LIMIT = 30;

/**
 * Query `locations` whose geohash falls within any of the bounding ranges for the
 * search circle. Each range is a separate single-field `orderBy(geohash)` range
 * query; results are merged and de-duplicated by document id because the ranges
 * can overlap. This is a coarse pre-filter — the exact radius is enforced later
 * by `rankByDistance`.
 */
async function queryNearbyLocations(db: Firestore, center: GeoPoint): Promise<LocationDoc[]> {
  const bounds = geohashQueryBounds([center.lat, center.lng], SEARCH_RADIUS_METERS);
  const locationsRef = collection(db, COLLECTIONS.locations);
  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      getDocs(query(locationsRef, orderBy("geohash"), startAt(start), endAt(end))),
    ),
  );

  const byId = new Map<string, LocationDoc>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const parsed = parseLocation(doc.id, doc.data());
      if (parsed !== undefined) {
        byId.set(parsed.id, parsed);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Batch-load `availability` records for the given location ids using chunked
 * `where("locationId", "in", ...)` queries, then flatten and validate them.
 */
async function loadAvailability(db: Firestore, locationIds: string[]): Promise<Availability[]> {
  if (locationIds.length === 0) {
    return [];
  }
  const availabilityRef = collection(db, COLLECTIONS.availability);
  const snapshots = await Promise.all(
    chunk(locationIds, AVAILABILITY_IN_LIMIT).map((ids) =>
      getDocs(query(availabilityRef, where("locationId", "in", ids))),
    ),
  );

  const items: Availability[] = [];
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const parsed = parseAvailability(doc.data());
      if (parsed !== undefined) {
        items.push(parsed);
      }
    }
  }
  return items;
}

/**
 * Find soda locations within 60 miles of `center`, sorted nearest-first, each
 * with the sodas available there. Loads availability only for the in-radius
 * locations so far-away candidates don't incur extra reads.
 */
export async function searchNearby(db: Firestore, center: GeoPoint): Promise<NearbyLocation[]> {
  const candidates = await queryNearbyLocations(db, center);
  const ranked = rankByDistance(center, candidates);

  const availability = await loadAvailability(
    db,
    ranked.map((entry) => entry.location.id),
  );
  const byLocation = groupAvailabilityByLocation(availability);

  return ranked.map((entry) => ({
    location: entry.location,
    distanceMiles: entry.distanceMiles,
    availability: byLocation.get(entry.location.id) ?? [],
  }));
}
