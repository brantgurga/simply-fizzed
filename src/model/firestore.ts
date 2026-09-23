// TypeScript models for the Firestore collections that back location-based soda
// discovery. These types describe the document data (excluding the document id)
// and are shared by the app, the emulator seed script, and tests.

/** Names of the Firestore collections, kept as constants to avoid typos. */
export const COLLECTIONS = {
  locations: "locations",
  sodas: "sodas",
  availability: "availability",
} as const;

/** A postal address for a location. */
export interface Address {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

/** A latitude/longitude coordinate pair. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * A place that sells soda (e.g. Kroger, Tim's Brewery). Stored under
 * `locations/{locationId}`. `geohash` is derived from `geo` via `geofire-common`
 * and enables radius queries with a single-field `orderBy(geohash)`.
 */
export interface Location {
  name: string;
  address: Address;
  geo: GeoPoint;
  geohash: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
}

/** A soda product. Stored under `sodas/{sodaId}`. */
export interface Soda {
  name: string;
  brand: string;
  flavor: string;
  aliases?: string[];
  initialAvailabilityId?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
}

/** The physical form a soda is sold in at a location. */
export type SodaForm = "draft" | "can" | "bottle";

/**
 * A join record describing which soda is available at which location and in what
 * form. Stored under `availability/{availabilityId}`. The `soda*` fields are
 * denormalized from the referenced soda so search results can render without an
 * extra lookup.
 */
export interface Availability {
  locationId: string;
  sodaId: string;
  form: SodaForm;
  sodaName: string;
  sodaBrand: string;
  sodaFlavor: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt?: Date;
}
