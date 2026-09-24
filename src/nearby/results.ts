// Pure helpers for turning raw Firestore documents into typed, display-ready
// nearby results: runtime parsing/validation of untrusted document data (no
// unsafe casts), grouping availability by location, and formatting sodas and
// addresses for the UI. Kept free of React and Firestore so it is unit testable.
import {
  type Address,
  type Availability,
  availabilityDocumentSchema,
  locationDocumentSchema,
  type SodaForm,
} from "../model/firestore";
import type { LocationDoc, RankedLocation } from "./distance";

/** A ranked location together with the sodas available there. */
export interface NearbyLocation extends RankedLocation {
  availability: Availability[];
}

/**
 * Validate a `locations/{id}` document at runtime and pair it with its id,
 * returning `undefined` if any required field is missing or the wrong type.
 */
export function parseLocation(id: string, data: unknown): LocationDoc | undefined {
  const parsed = locationDocumentSchema.safeParse(data);
  return parsed.success ? { id, ...parsed.data } : undefined;
}

/**
 * Validate an `availability/{id}` document at runtime, returning `undefined` if
 * any required field is missing or the wrong type.
 */
export function parseAvailability(data: unknown): Availability | undefined {
  const parsed = availabilityDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
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
