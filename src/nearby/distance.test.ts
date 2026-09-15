import { describe, expect, it } from "vitest";
import type { LocationDoc } from "./distance";
import { chunk, distanceMiles, rankByDistance, SEARCH_RADIUS_MILES } from "./distance";

function locationAt(id: string, lat: number, lng: number): LocationDoc {
  return {
    id,
    name: id,
    address: { street: "1 Main St", city: "Town", state: "ST", postalCode: "00000" },
    geo: { lat, lng },
    geohash: "0000000000",
  };
}

describe("distanceMiles", () => {
  it("is zero between identical points", () => {
    expect(distanceMiles({ lat: 39.1, lng: -94.6 }, { lat: 39.1, lng: -94.6 })).toBe(0);
  });

  it("is about 69 miles for one degree of longitude at the equator", () => {
    const miles = distanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });

    expect(miles).toBeGreaterThan(68);
    expect(miles).toBeLessThan(70);
  });

  it("is symmetric between the two coordinates", () => {
    const a = { lat: 39.1, lng: -94.6 };
    const b = { lat: 40.2, lng: -93.1 };

    expect(distanceMiles(a, b)).toBeCloseTo(distanceMiles(b, a), 10);
  });

  it("is about 60 miles at the search-radius offset due north", () => {
    // A pure-latitude step of ~0.8684 degrees is ~60 miles under the mean-radius
    // Haversine formula geofire-common uses, confirming the radius boundary.
    const miles = distanceMiles({ lat: 0, lng: 0 }, { lat: 0.868428, lng: 0 });

    expect(miles).toBeCloseTo(60, 1);
  });
});

describe("rankByDistance", () => {
  const center = { lat: 39.0997, lng: -94.5786 };

  it("drops locations beyond the search radius", () => {
    // ~1 degree of latitude is ~69 miles, so 2 degrees north is well outside 60.
    const far = locationAt("far", center.lat + 2, center.lng);
    const near = locationAt("near", center.lat + 0.1, center.lng);

    const ranked = rankByDistance(center, [far, near]);

    expect(ranked.map((entry) => entry.location.id)).toEqual(["near"]);
    expect(ranked[0]?.distanceMiles).toBeLessThanOrEqual(SEARCH_RADIUS_MILES);
  });

  it("includes a location just inside the 60-mile boundary", () => {
    // ~0.868 degrees due north is ~59.97 miles, just within the inclusive radius.
    const inside = locationAt("inside", center.lat + 0.868, center.lng);

    const ranked = rankByDistance(center, [inside]);

    expect(ranked.map((entry) => entry.location.id)).toEqual(["inside"]);
    expect(ranked[0]?.distanceMiles).toBeLessThanOrEqual(SEARCH_RADIUS_MILES);
  });

  it("excludes a location just outside the 60-mile boundary", () => {
    // ~0.869 degrees due north is ~60.04 miles, just beyond the radius.
    const outside = locationAt("outside", center.lat + 0.869, center.lng);

    expect(rankByDistance(center, [outside])).toEqual([]);
  });

  it("returns an empty array when given no locations", () => {
    expect(rankByDistance(center, [])).toEqual([]);
  });

  it("sorts survivors nearest-first", () => {
    const nearest = locationAt("nearest", center.lat + 0.05, center.lng);
    const middle = locationAt("middle", center.lat + 0.3, center.lng);
    const farthest = locationAt("farthest", center.lat + 0.7, center.lng);

    const ranked = rankByDistance(center, [farthest, nearest, middle]);

    expect(ranked.map((entry) => entry.location.id)).toEqual(["nearest", "middle", "farthest"]);
  });

  it("does not mutate the input array", () => {
    const input = [locationAt("a", center.lat, center.lng)];

    rankByDistance(center, input);

    expect(input).toHaveLength(1);
  });
});

describe("chunk", () => {
  it("splits into consecutive chunks of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("puts everything in one chunk when the size exceeds the length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("splits an exact multiple into even chunks with no trailing partial", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("splits into singletons for a size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("throws for a non-positive or non-integer size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], -1)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});
