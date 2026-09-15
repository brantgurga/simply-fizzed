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

  it("throws for a non-positive or non-integer size", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], -1)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});
