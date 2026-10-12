// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { collection, collectionGroup, getDocs, type Firestore } from "firebase/firestore";
import type { Availability, AvailabilityValue, SodaForm } from "../model/firestore";
import { COLLECTIONS } from "../model/firestore";
import type { LocationDoc } from "../nearby/distance";
import { parseAvailability, parseLocation } from "../nearby/results";
import { parseRating } from "../rating/ratings";
import { loadSodaCatalog, rankSodas, type SodaDocument } from "./sodas";

export interface SodaCatalogItem extends SodaDocument {
  averageRating?: number;
  ratingCount: number;
  tried: boolean;
  availability: Availability[];
}

export interface SodaCatalogData {
  items: SodaCatalogItem[];
  locations: LocationDoc[];
}

export type TriedFilter = "all" | "tried" | "not-tried";
export type CatalogSort = "name" | "brand" | "flavor" | "rating";

export interface SodaCatalogFilters {
  search: string;
  brand: string;
  flavor: string;
  minimumRating: number;
  tried: TriedFilter;
  form: "" | SodaForm;
  canSample: "" | AvailabilityValue;
  canPurchase: "" | AvailabilityValue;
  sort: CatalogSort;
}

/** Load the complete public catalog graph so Firestore can retain it for offline discovery. */
export async function loadSodaCatalogData(
  db: Firestore,
  userId?: string,
): Promise<SodaCatalogData> {
  const [sodas, availabilitySnapshot, locationSnapshot, ratingSnapshot] = await Promise.all([
    loadSodaCatalog(db),
    getDocs(collection(db, COLLECTIONS.availability)),
    getDocs(collection(db, COLLECTIONS.locations)),
    getDocs(collectionGroup(db, COLLECTIONS.ratings)),
  ]);

  const availability = availabilitySnapshot.docs.flatMap((item) => {
    const parsed = parseAvailability(item.data());
    return parsed === undefined ? [] : [{ ...parsed, documentId: item.id }];
  });
  const locations = locationSnapshot.docs.flatMap((item) => {
    const parsed = parseLocation(item.id, item.data());
    return parsed === undefined ? [] : [parsed];
  });
  const ratings = ratingSnapshot.docs.flatMap((item) => {
    const parsed = parseRating(item.id, item.data());
    return parsed === undefined ? [] : [parsed];
  });

  const items: SodaCatalogItem[] = [];
  for (const soda of sodas) {
    const sodaAvailability = availability.filter((item) => item.sodaId === soda.id);
    const sodaRatings = ratings.filter(
      (rating) => rating.sodaOfferingId === soda.id && rating.rating !== null,
    );
    const ratingTotal = sodaRatings.reduce((total, rating) => total + (rating.rating ?? 0), 0);
    items.push({
      ...soda,
      availability: sodaAvailability,
      ratingCount: sodaRatings.length,
      ...(sodaRatings.length === 0 ? {} : { averageRating: ratingTotal / sodaRatings.length }),
      tried: ratings.some(
        (rating) => rating.sodaOfferingId === soda.id && rating.userId === userId,
      ),
    });
  }

  return { items, locations };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function matchesCatalogAvailability(
  item: Availability,
  filters: SodaCatalogFilters,
): boolean {
  return (
    (filters.form === "" || item.form === filters.form) &&
    (filters.canSample === "" || item.canSample === filters.canSample) &&
    (filters.canPurchase === "" || item.canPurchase === filters.canPurchase)
  );
}

/** Apply composable semantic filters before pagination or map presentation. */
export function filterSodaCatalog(
  items: readonly SodaCatalogItem[],
  filters: SodaCatalogFilters,
): SodaCatalogItem[] {
  const matchesSearch = new Set(rankSodas(items, filters.search).map((item) => item.id));
  return items
    .filter((item) => matchesSearch.has(item.id))
    .filter((item) => filters.brand === "" || item.brand === filters.brand)
    .filter((item) => filters.flavor === "" || item.flavor === filters.flavor)
    .filter(
      (item) =>
        filters.minimumRating === 0 ||
        (item.averageRating !== undefined && item.averageRating >= filters.minimumRating),
    )
    .filter(
      (item) => filters.tried === "all" || (filters.tried === "tried" ? item.tried : !item.tried),
    )
    .filter(
      (item) =>
        (filters.form === "" && filters.canSample === "" && filters.canPurchase === "") ||
        item.availability.some((availability) => matchesCatalogAvailability(availability, filters)),
    )
    .toSorted((left, right) => {
      if (filters.sort === "rating") {
        const ratingOrder = (right.averageRating ?? -1) - (left.averageRating ?? -1);
        if (ratingOrder !== 0) return ratingOrder;
      }
      const field = filters.sort === "rating" ? "name" : filters.sort;
      return (
        collator.compare(left[field], right[field]) ||
        collator.compare(left.brand, right.brand) ||
        collator.compare(left.name, right.name) ||
        collator.compare(left.id, right.id)
      );
    });
}

/** Resolve unique physical locations for every availability match in a result set. */
export function catalogResultLocations(
  items: readonly SodaCatalogItem[],
  locations: readonly LocationDoc[],
  filters?: SodaCatalogFilters,
): LocationDoc[] {
  const locationIds = new Set(
    items.flatMap((item) =>
      item.availability
        .filter(
          (availability) =>
            filters === undefined || matchesCatalogAvailability(availability, filters),
        )
        .map((availability) => availability.locationId),
    ),
  );
  return locations.filter((location) => locationIds.has(location.id));
}
