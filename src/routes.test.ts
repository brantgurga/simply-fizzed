// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { locationRoute, manageUsersRoute, parseHashRoute, profileRoute, sodaRoute } from "./routes";

describe("hash routes", () => {
  it("preserves the browse home", () => {
    expect(parseHashRoute("")).toEqual({ page: "home" });
    expect(parseHashRoute("#/")).toEqual({ page: "home" });
  });

  it("recognizes the exact privileged management route", () => {
    expect(parseHashRoute(manageUsersRoute)).toEqual({ page: "manageUsers" });
  });

  it("round-trips safely encoded exact document ids", () => {
    const locationId = "store/one $ downtown";
    const sodaId = "brand/zero & lime";
    const userId = "firebase/user id";

    expect(parseHashRoute(locationRoute(locationId))).toEqual({ page: "location", id: locationId });
    expect(parseHashRoute(sodaRoute(sodaId))).toEqual({ page: "soda", id: sodaId });
    expect(parseHashRoute(profileRoute(userId))).toEqual({ page: "profile", id: userId });
  });

  it("rejects unknown, incomplete, and malformed routes", () => {
    expect(parseHashRoute("#/locations")).toEqual({ page: "notFound" });
    expect(parseHashRoute("#/other/id")).toEqual({ page: "notFound" });
    expect(parseHashRoute("#/sodas/%E0%A4%A")).toEqual({ page: "notFound" });
  });
});
