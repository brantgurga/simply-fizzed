// Distance calculation, the 60-mile radius filter, and nearest-first sorting are
// kept here as pure functions with no React or Firestore dependencies so they can
// be unit tested in isolation (issue #49). The Firestore querying that feeds them
// lives in `nearby.ts`.
import { distanceBetween, type Geopoint } from "geofire-common";
import type { GeoPoint, Location } from "../model/firestore";

/** The search radius, in miles, for nearby results. */
export const SEARCH_RADIUS_MILES = 60;

/** Kilometers per mile, used to convert `geofire-common`'s km distances. */
const KILOMETERS_PER_MILE = 1.609344;

/** The search radius expressed in meters, for `geohashQueryBounds`. */
export const SEARCH_RADIUS_METERS = SEARCH_RADIUS_MILES * KILOMETERS_PER_MILE * 1000;

/** A `locations/{id}` document paired with its Firestore document id. */
export interface LocationDoc extends Location {
  id: string;
}

/** A location together with its computed distance from the search center. */
export interface RankedLocation {
  location: LocationDoc;
  distanceMiles: number;
}

/** Convert a `GeoPoint` to the `[lat, lng]` tuple `geofire-common` expects. */
function toGeopoint(point: GeoPoint): Geopoint {
  return [point.lat, point.lng];
}

/**
 * Distance in miles between two coordinates, via the Haversine formula
 * (`geofire-common` returns kilometers, converted here). Approximate because the
 * Earth's radius varies slightly with latitude.
 */
export function distanceMiles(from: GeoPoint, to: GeoPoint): number {
  return distanceBetween(toGeopoint(from), toGeopoint(to)) / KILOMETERS_PER_MILE;
}

/**
 * Pair each location with its distance from `center`, drop any beyond
 * `SEARCH_RADIUS_MILES`, and sort the survivors nearest-first. The geohash bounds
 * query is a coarse pre-filter, so this exact-distance pass is what enforces the
 * true radius.
 */
export function rankByDistance(
  center: GeoPoint,
  locations: readonly LocationDoc[],
): RankedLocation[] {
  return locations
    .map((location) => ({ location, distanceMiles: distanceMiles(center, location.geo) }))
    .filter((ranked) => ranked.distanceMiles <= SEARCH_RADIUS_MILES)
    .toSorted((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * Split `items` into consecutive chunks of at most `size`. Used to batch
 * Firestore `where("locationId", "in", ...)` queries, which cap the array at 30
 * values. Throws if `size` is not a positive integer.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
