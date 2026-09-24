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

const availabilityWithoutContributionAttribution: Availability = {
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
    expect(parseLocation("loc-1", { ...validLocation, createdAt: new Date() })).toEqual({
      id: "loc-1",
      ...validLocation,
    });
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
  it("parses a document created before contribution attribution was added", () => {
    expect(parseAvailability(availabilityWithoutContributionAttribution)).toEqual(
      availabilityWithoutContributionAttribution,
    );
  });

  it("parses complete contribution attribution", () => {
    const timestamp = new Date("2026-09-22T12:00:00Z");
    expect(
      parseAvailability({
        ...availabilityWithoutContributionAttribution,
        createdBy: "fan-123",
        createdByName: "Soda Fan",
        createdAt: { toDate: () => timestamp },
        updatedBy: "fan-123",
        updatedByName: "Soda Fan",
        updatedAt: { toDate: () => timestamp },
      }),
    ).toEqual({
      ...availabilityWithoutContributionAttribution,
      createdBy: "fan-123",
      createdByName: "Soda Fan",
      createdAt: timestamp,
      updatedBy: "fan-123",
      updatedByName: "Soda Fan",
      updatedAt: timestamp,
    });
  });

  it("ignores inherited contribution attribution", () => {
    const value = { ...availabilityWithoutContributionAttribution };
    Object.setPrototypeOf(value, {
      createdBy: "fan-123",
      createdByName: "Soda Fan",
      createdAt: { toDate: () => new Date() },
      updatedBy: "fan-123",
      updatedByName: "Soda Fan",
      updatedAt: { toDate: () => new Date() },
    });

    expect(parseAvailability(value)).toEqual(availabilityWithoutContributionAttribution);
  });

  it("returns undefined for partial contribution attribution", () => {
    expect(
      parseAvailability({
        ...availabilityWithoutContributionAttribution,
        createdBy: "fan-123",
        createdByName: "Soda Fan",
      }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, createdBy: undefined }),
    ).toBeUndefined();
  });

  it("returns undefined for malformed complete contribution attribution", () => {
    expect(
      parseAvailability({
        ...availabilityWithoutContributionAttribution,
        createdBy: "fan-123",
        createdByName: "Soda Fan",
        createdAt: "not-a-timestamp",
        updatedBy: "fan-123",
        updatedByName: "Soda Fan",
        updatedAt: "not-a-timestamp",
      }),
    ).toBeUndefined();
    expect(
      parseAvailability({
        ...availabilityWithoutContributionAttribution,
        createdBy: "fan-123",
        createdByName: "Soda Fan",
        createdAt: new Date(),
        updatedBy: "fan-123",
        updatedByName: "Soda Fan",
        updatedAt: new Date(),
      }),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown or missing form", () => {
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, form: "keg" }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, form: undefined }),
    ).toBeUndefined();
  });

  it("returns undefined when any required string field is missing or mistyped", () => {
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, locationId: undefined }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, sodaId: 7 }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, sodaName: undefined }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, sodaBrand: null }),
    ).toBeUndefined();
    expect(
      parseAvailability({ ...availabilityWithoutContributionAttribution, sodaFlavor: undefined }),
    ).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(parseAvailability("nope")).toBeUndefined();
    expect(parseAvailability(null)).toBeUndefined();
  });
});

describe("groupAvailabilityByLocation", () => {
  it("buckets records by their locationId", () => {
    const other: Availability = {
      ...availabilityWithoutContributionAttribution,
      locationId: "loc-2",
      sodaId: "soda-2",
    };
    const another: Availability = {
      ...availabilityWithoutContributionAttribution,
      sodaId: "soda-3",
    };

    const grouped = groupAvailabilityByLocation([
      availabilityWithoutContributionAttribution,
      other,
      another,
    ]);

    expect(grouped.get("loc-1")).toEqual([availabilityWithoutContributionAttribution, another]);
    expect(grouped.get("loc-2")).toEqual([other]);
  });

  it("ignores duplicate soda and form tuples across attribution schema versions", () => {
    const duplicate = {
      ...availabilityWithoutContributionAttribution,
      createdBy: "another-fan",
    };

    expect(
      groupAvailabilityByLocation([availabilityWithoutContributionAttribution, duplicate]).get(
        "loc-1",
      ),
    ).toEqual([availabilityWithoutContributionAttribution]);
  });

  it("returns an empty map for empty input", () => {
    expect(groupAvailabilityByLocation([]).size).toBe(0);
  });
});

describe("formatSodaAvailability", () => {
  it("phrases each form for display", () => {
    expect(
      formatSodaAvailability({ ...availabilityWithoutContributionAttribution, form: "can" }),
    ).toBe("Big K Root Beer in cans");
    expect(
      formatSodaAvailability({ ...availabilityWithoutContributionAttribution, form: "bottle" }),
    ).toBe("Big K Root Beer in bottles");
    expect(
      formatSodaAvailability({ ...availabilityWithoutContributionAttribution, form: "draft" }),
    ).toBe("Big K Root Beer on draft");
    expect(
      formatSodaAvailability({
        ...availabilityWithoutContributionAttribution,
        sodaName: "Cola",
        sodaFlavor: "Cherry",
      }),
    ).toBe("Big K Cola (Cherry) in cans");
  });
});

describe("formatAddress", () => {
  it("renders a single line", () => {
    expect(formatAddress(validLocation.address)).toBe("1 Main St, Kansas City, MO 64106");
  });
});

describe("formatLocationUpdatedAt", () => {
  it("includes a localized date and time", () => {
    const formatted = formatLocationUpdatedAt(new Date(2026, 8, 19, 15, 30), "en-US");

    expect(formatted).toBe("Sep 19, 2026, 3:30 PM");
  });
});
