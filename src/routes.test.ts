import { describe, expect, it } from "vitest";
import { locationRoute, parseHashRoute, sodaRoute } from "./routes";

describe("hash routes", () => {
  it("preserves the browse home", () => {
    expect(parseHashRoute("")).toEqual({ page: "home" });
    expect(parseHashRoute("#/")).toEqual({ page: "home" });
  });

  it("round-trips safely encoded exact document ids", () => {
    const locationId = "store/one $ downtown";
    const sodaId = "brand/zero & lime";

    expect(parseHashRoute(locationRoute(locationId))).toEqual({ page: "location", id: locationId });
    expect(parseHashRoute(sodaRoute(sodaId))).toEqual({ page: "soda", id: sodaId });
  });

  it("rejects unknown, incomplete, and malformed routes", () => {
    expect(parseHashRoute("#/locations")).toEqual({ page: "notFound" });
    expect(parseHashRoute("#/other/id")).toEqual({ page: "notFound" });
    expect(parseHashRoute("#/sodas/%E0%A4%A")).toEqual({ page: "notFound" });
  });
});
