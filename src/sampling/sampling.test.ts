import { describe, expect, it } from "vitest";
import { compareAlphabetically, compareRecentlyRated, type Sampling } from "./sampling";

function sampling(overrides: Partial<Sampling> = {}): Sampling {
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

describe("sampling inventory sorting", () => {
  it("sorts offering labels alphabetically with record IDs as the final tie-breaker", () => {
    const records = [
      sampling({ id: "z", sodaBrand: "Beta" }),
      sampling({ id: "b", sodaBrand: "Alpha" }),
      sampling({ id: "a", sodaBrand: "Alpha" }),
    ];

    expect(records.toSorted(compareAlphabetically).map(({ id }) => id)).toEqual(["a", "b", "z"]);
    expect(
      [sampling({ id: "a" }), sampling({ id: "A" })]
        .toSorted(compareAlphabetically)
        .map(({ id }) => id),
    ).toEqual(["A", "a"]);
  });

  it("sorts rated records first by rating time and unrated records by sampling time", () => {
    const records = [
      sampling({ id: "unrated-old" }),
      sampling({
        id: "rated-old",
        rating: 3,
        lastRatedAt: new Date("2026-02-01T00:00:00Z"),
      }),
      sampling({ id: "unrated-new", firstRecorded: new Date("2026-04-01T00:00:00Z") }),
      sampling({
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
