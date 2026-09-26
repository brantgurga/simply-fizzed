import { describe, expect, it } from "vitest";
import {
  compareAlphabetically,
  compareRecentlyRated,
  sodaOfferingLabel,
  type RatingRecord,
} from "./ratings";

function rating(overrides: Partial<RatingRecord> = {}): RatingRecord {
  return {
    id: "sample-a",
    userId: "fan",
    sodaOfferingId: "cola",
    sodaName: "Cola",
    sodaBrand: "Brand",
    sodaFlavor: "Original",
    rating: null,
    firstRecorded: new Date("2026-01-01T00:00:00Z"),
    lastRatedAt: null,
    ...overrides,
  };
}

describe("rating inventory sorting", () => {
  it("sorts full offering labels alphabetically with record IDs as the final tie-breaker", () => {
    const records = [
      rating({ id: "z", sodaBrand: "Beta" }),
      rating({ id: "flavor-z", sodaBrand: "Alpha", sodaFlavor: "Vanilla" }),
      rating({ id: "flavor-a", sodaBrand: "Alpha", sodaFlavor: "Cherry" }),
      rating({ id: "name", sodaBrand: "Alpha", sodaName: "Root Beer" }),
    ];

    expect(records.toSorted(compareAlphabetically).map(({ id }) => id)).toEqual([
      "flavor-a",
      "flavor-z",
      "name",
      "z",
    ]);
    expect(
      [rating({ id: "a" }), rating({ id: "A" })]
        .toSorted(compareAlphabetically)
        .map(({ id }) => id),
    ).toEqual(["A", "a"]);
    expect(sodaOfferingLabel(rating())).toBe("Brand Cola (Original)");
  });

  it("sorts rated records first by rating time and unrated records by sampling time", () => {
    const records = [
      rating({ id: "unrated-old" }),
      rating({
        id: "rated-old",
        rating: 3,
        lastRatedAt: new Date("2026-02-01T00:00:00Z"),
      }),
      rating({ id: "unrated-new", firstRecorded: new Date("2026-04-01T00:00:00Z") }),
      rating({
        id: "rated-new",
        rating: 5,
        lastRatedAt: new Date("2026-03-01T00:00:00Z"),
      }),
    ];

    expect(records.toSorted(compareRecentlyRated).map(({ id }) => id)).toEqual([
      "rated-new",
      "rated-old",
      "unrated-new",
      "unrated-old",
    ]);
  });
});
