// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { catalogResultLocations, filterSodaCatalog, type SodaCatalogItem } from "./catalog";

const baseFilters = {
  search: "",
  brand: "",
  flavor: "",
  minimumRating: 0,
  tried: "all" as const,
  form: "" as const,
  canSample: "" as const,
  canPurchase: "" as const,
  sort: "name" as const,
};

const items: SodaCatalogItem[] = [
  {
    id: "sprecher-root",
    brand: "Sprecher",
    name: "Root Beer",
    flavor: "Root Beer",
    averageRating: 4.5,
    ratingCount: 2,
    tried: false,
    availability: [
      {
        locationId: "brewery",
        sodaId: "sprecher-root",
        sodaName: "Root Beer",
        sodaBrand: "Sprecher",
        sodaFlavor: "Root Beer",
        form: "draft",
        canSample: "yes",
        canPurchase: "yes",
      },
    ],
  },
  {
    id: "lemon-up",
    brand: "7-Up",
    name: "Lemon-Up",
    flavor: "Lemon-Lime",
    ratingCount: 0,
    tried: true,
    availability: [],
  },
];

describe("filterSodaCatalog", () => {
  it("uses AND search semantics across fields", () => {
    expect(filterSodaCatalog(items, { ...baseFilters, search: "sprecher root" })).toEqual([
      items[0],
    ]);
    expect(filterSodaCatalog(items, { ...baseFilters, search: "rootbeer" })).toEqual([items[0]]);
    expect(filterSodaCatalog(items, { ...baseFilters, search: "7-up root beer" })).toEqual([]);
  });

  it("composes rating, tried, and availability filters", () => {
    expect(
      filterSodaCatalog(items, {
        ...baseFilters,
        minimumRating: 4,
        tried: "not-tried",
        form: "draft",
        canSample: "yes",
      }),
    ).toEqual([items[0]]);
  });

  it("keeps sodas without availability when no availability filter is active", () => {
    expect(filterSodaCatalog(items, baseFilters)).toHaveLength(2);
  });

  it("sorts literal aggregate averages with unrated sodas last", () => {
    expect(
      filterSodaCatalog(items, { ...baseFilters, sort: "rating" }).map((item) => item.id),
    ).toEqual(["sprecher-root", "lemon-up"]);
  });
});

describe("catalogResultLocations", () => {
  it("returns each matching physical location once", () => {
    const locations = [
      {
        id: "brewery",
        name: "Brewery",
        address: { street: "1 Main", city: "City", state: "WI", postalCode: "1" },
        geo: { lat: 1, lng: 2 },
        geohash: "hash",
      },
    ];
    expect(catalogResultLocations(items, locations)).toEqual(locations);
  });
});
