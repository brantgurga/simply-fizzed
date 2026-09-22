import { describe, expect, it } from "vitest";
import type { Availability } from "../model/firestore";
import {
  formatAddress,
  formatLocationUpdatedAt,
  formatSodaAvailability,
  groupAvailabilityByLocation,
  parseAvailability,
  parseLocation,
} from "./results";

const validLocation = {
  name: "Tim's Brewery",
  address: { street: "1 Main St", city: "Kansas City", state: "MO", postalCode: "64106" },
  geo: { lat: 39.1, lng: -94.6 },
  geohash: "9yzgcjb0dz",
};

const validAvailability: Availability = {
  locationId: "loc-1",
  sodaId: "soda-1",
  form: "can",
  sodaName: "Root Beer",
  sodaBrand: "Big K",
  sodaFlavor: "root beer",
};

describe("parseLocation", () => {
  it("parses a valid document and attaches the id", () => {
    expect(parseLocation("loc-1", validLocation)).toEqual({ id: "loc-1", ...validLocation });
  });

  it("parses optional attribution and Firestore timestamps", () => {
    const createdAt = new Date("2026-09-18T12:00:00Z");
    const updatedAt = new Date("2026-09-19T15:30:00Z");

    expect(
      parseLocation("loc-1", {
        ...validLocation,
        createdBy: "fan-123",
        createdByName: "First Fan",
        createdAt: { toDate: () => createdAt },
        updatedBy: "fan-456",
        updatedByName: "Unknown",
        updatedAt: { toDate: () => updatedAt },
      }),
    ).toEqual({
      id: "loc-1",
      ...validLocation,
      createdBy: "fan-123",
      createdByName: "First Fan",
      createdAt,
      updatedBy: "fan-456",
      updatedByName: "Unknown",
      updatedAt,
    });
  });

  it("drops missing or malformed optional attribution", () => {
    expect(
      parseLocation("loc-1", {
        ...validLocation,
        createdBy: 123,
        createdByName: "   ",
        createdAt: { toDate: () => "not-a-date" },
        updatedAt: { toDate: () => new Date(Number.NaN) },
      }),
    ).toEqual({ id: "loc-1", ...validLocation });
  });

  it("returns undefined when a required field is missing or mistyped", () => {
    expect(parseLocation("loc-1", { ...validLocation, name: 42 })).toBeUndefined();
    expect(parseLocation("loc-1", { ...validLocation, geohash: 42 })).toBeUndefined();
    expect(parseLocation("loc-1", { ...validLocation, geo: { lat: "x", lng: 1 } })).toBeUndefined();
    expect(parseLocation("loc-1", { ...validLocation, geo: { lat: 1, lng: "y" } })).toBeUndefined();
    expect(parseLocation("loc-1", { ...validLocation, geo: undefined })).toBeUndefined();
  });

  it("returns undefined when the address is missing a field", () => {
    expect(parseLocation("loc-1", { ...validLocation, address: {} })).toBeUndefined();
    expect(
      parseLocation("loc-1", {
        ...validLocation,
        address: { street: "1 Main St", city: "Kansas City", state: "MO" },
      }),
    ).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(parseLocation("loc-1", null)).toBeUndefined();
    expect(parseLocation("loc-1", "nope")).toBeUndefined();
    expect(parseLocation("loc-1", 42)).toBeUndefined();
  });
});

describe("parseAvailability", () => {
  it("parses a valid document", () => {
    expect(parseAvailability(validAvailability)).toEqual(validAvailability);
  });

  it("returns undefined for an unknown or missing form", () => {
    expect(parseAvailability({ ...validAvailability, form: "keg" })).toBeUndefined();
    expect(parseAvailability({ ...validAvailability, form: undefined })).toBeUndefined();
  });

  it("returns undefined when any required string field is missing or mistyped", () => {
    expect(parseAvailability({ ...validAvailability, locationId: undefined })).toBeUndefined();
    expect(parseAvailability({ ...validAvailability, sodaId: 7 })).toBeUndefined();
    expect(parseAvailability({ ...validAvailability, sodaName: undefined })).toBeUndefined();
    expect(parseAvailability({ ...validAvailability, sodaBrand: null })).toBeUndefined();
    expect(parseAvailability({ ...validAvailability, sodaFlavor: undefined })).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(parseAvailability("nope")).toBeUndefined();
    expect(parseAvailability(null)).toBeUndefined();
  });
});

describe("groupAvailabilityByLocation", () => {
  it("buckets records by their locationId", () => {
    const other: Availability = { ...validAvailability, locationId: "loc-2", sodaId: "soda-2" };
    const another: Availability = { ...validAvailability, sodaId: "soda-3" };

    const grouped = groupAvailabilityByLocation([validAvailability, other, another]);

    expect(grouped.get("loc-1")).toEqual([validAvailability, another]);
    expect(grouped.get("loc-2")).toEqual([other]);
  });

  it("returns an empty map for empty input", () => {
    expect(groupAvailabilityByLocation([]).size).toBe(0);
  });
});

describe("formatSodaAvailability", () => {
  it("phrases each form for display", () => {
    expect(formatSodaAvailability({ ...validAvailability, form: "can" })).toBe(
      "Big K Root Beer in cans",
    );
    expect(formatSodaAvailability({ ...validAvailability, form: "bottle" })).toBe(
      "Big K Root Beer in bottles",
    );
    expect(formatSodaAvailability({ ...validAvailability, form: "draft" })).toBe(
      "Big K Root Beer on draft",
    );
  });
});

describe("formatAddress", () => {
  it("renders a single line", () => {
    expect(formatAddress(validLocation.address)).toBe("1 Main St, Kansas City, MO 64106");
  });
});

describe("formatLocationUpdatedAt", () => {
  it("includes a localized date and time", () => {
    const formatted = formatLocationUpdatedAt(new Date(2026, 8, 19, 15, 30));

    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/3:30|15:30/);
  });
});
