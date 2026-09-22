// Pure helpers for turning raw Firestore documents into typed, display-ready
// nearby results: runtime parsing/validation of untrusted document data (no
// unsafe casts), grouping availability by location, and formatting sodas and
// addresses for the UI. Kept free of React and Firestore so it is unit testable.
import type { Address, Availability, SodaForm } from "../model/firestore";
import type { LocationDoc, RankedLocation } from "./distance";

/** A ranked location together with the sodas available there. */
export interface NearbyLocation extends RankedLocation {
  availability: Availability[];
}

/** Narrow an unknown value to an indexable object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Return `value[key]` when it is a string, otherwise `undefined`. */
function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

/** Return a non-blank optional string field, otherwise `undefined`. */
function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = stringField(value, key);
  return field === undefined || field.trim().length === 0 ? undefined : field;
}

/** Convert a Firestore timestamp-like value to a valid `Date`. */
function parseTimestamp(value: unknown): Date | undefined {
  if (!isRecord(value)) return undefined;
  const toDate = value["toDate"];
  if (typeof toDate !== "function") return undefined;
  try {
    const date: unknown = toDate.call(value);
    return date instanceof Date && !Number.isNaN(date.valueOf()) ? date : undefined;
  } catch {
    return undefined;
  }
}

/** Parse an `address` sub-object, returning `undefined` when malformed. */
function parseAddress(value: unknown): Address | undefined {
  if (!isRecord(value)) return undefined;
  const street = stringField(value, "street");
  const city = stringField(value, "city");
  const state = stringField(value, "state");
  const postalCode = stringField(value, "postalCode");
  if (
    street === undefined ||
    city === undefined ||
    state === undefined ||
    postalCode === undefined
  ) {
    return undefined;
  }
  return { street, city, state, postalCode };
}

/**
 * Validate a `locations/{id}` document at runtime and pair it with its id,
 * returning `undefined` if any required field is missing or the wrong type.
 */
export function parseLocation(id: string, data: unknown): LocationDoc | undefined {
  if (!isRecord(data)) return undefined;
  const name = stringField(data, "name");
  const geohash = stringField(data, "geohash");
  if (name === undefined || geohash === undefined) return undefined;
  const address = parseAddress(data["address"]);
  if (address === undefined) return undefined;
  const geo = data["geo"];
  if (!isRecord(geo) || typeof geo["lat"] !== "number" || typeof geo["lng"] !== "number") {
    return undefined;
  }

  const createdBy = optionalStringField(data, "createdBy");
  const createdByName = optionalStringField(data, "createdByName");
  const createdAt = parseTimestamp(data["createdAt"]);
  const updatedBy = optionalStringField(data, "updatedBy");
  const updatedByName = optionalStringField(data, "updatedByName");
  const updatedAt = parseTimestamp(data["updatedAt"]);

  return {
    id,
    name,
    address,
    geo: { lat: geo["lat"], lng: geo["lng"] },
    geohash,
    ...(createdBy === undefined ? {} : { createdBy }),
    ...(createdByName === undefined ? {} : { createdByName }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedBy === undefined ? {} : { updatedBy }),
    ...(updatedByName === undefined ? {} : { updatedByName }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

/** True when `value` is one of the known soda forms. */
function isSodaForm(value: unknown): value is SodaForm {
  return value === "draft" || value === "can" || value === "bottle";
}

/**
 * Validate an `availability/{id}` document at runtime, returning `undefined` if
 * any required field is missing or the wrong type.
 */
export function parseAvailability(data: unknown): Availability | undefined {
  if (!isRecord(data)) return undefined;
  const locationId = stringField(data, "locationId");
  const sodaId = stringField(data, "sodaId");
  const sodaName = stringField(data, "sodaName");
  const sodaBrand = stringField(data, "sodaBrand");
  const sodaFlavor = stringField(data, "sodaFlavor");
  const form = data["form"];
  if (
    locationId === undefined ||
    sodaId === undefined ||
    sodaName === undefined ||
    sodaBrand === undefined ||
    sodaFlavor === undefined ||
    !isSodaForm(form)
  ) {
    return undefined;
  }
  const createdBy = optionalStringField(data, "createdBy");
  const createdByName = optionalStringField(data, "createdByName");
  const createdAt = parseTimestamp(data["createdAt"]);
  const updatedBy = optionalStringField(data, "updatedBy");
  const updatedByName = optionalStringField(data, "updatedByName");
  const updatedAt = parseTimestamp(data["updatedAt"]);
  return {
    locationId,
    sodaId,
    form,
    sodaName,
    sodaBrand,
    sodaFlavor,
    ...(createdBy === undefined ? {} : { createdBy }),
    ...(createdByName === undefined ? {} : { createdByName }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedBy === undefined ? {} : { updatedBy }),
    ...(updatedByName === undefined ? {} : { updatedByName }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  };
}

/** Group availability records by location, ignoring duplicate soda/form tuples. */
export function groupAvailabilityByLocation(
  items: readonly Availability[],
): Map<string, Availability[]> {
  const byLocation = new Map<string, Availability[]>();
  const identities = new Set<string>();
  for (const item of items) {
    const identity = JSON.stringify([item.locationId, item.sodaId, item.form]);
    if (identities.has(identity)) continue;
    identities.add(identity);

    const existing = byLocation.get(item.locationId);
    if (existing === undefined) {
      byLocation.set(item.locationId, [item]);
    } else {
      existing.push(item);
    }
  }
  return byLocation;
}

/** Human-readable phrase for each soda form, e.g. `can` -> "in cans". */
const FORM_PHRASES: Record<SodaForm, string> = {
  draft: "on draft",
  can: "in cans",
  bottle: "in bottles",
};

/**
 * Format a single availability record for display, e.g. "Big K Root Beer in
 * cans" or "Tim's Root Beer on draft".
 */
export function formatSodaAvailability(item: Availability): string {
  const flavor =
    item.sodaName.localeCompare(item.sodaFlavor, undefined, { sensitivity: "base" }) === 0
      ? ""
      : ` (${item.sodaFlavor})`;
  return `${item.sodaBrand} ${item.sodaName}${flavor} ${FORM_PHRASES[item.form]}`;
}

/** Format an address as a single line: "street, city, state postalCode". */
export function formatAddress(address: Address): string {
  return `${address.street}, ${address.city}, ${address.state} ${address.postalCode}`;
}

/** Format a location update timestamp using the visitor's locale. */
export function formatLocationUpdatedAt(updatedAt: Date, locales?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locales, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(updatedAt);
}
