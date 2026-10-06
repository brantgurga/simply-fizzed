// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import type { Availability } from "../model/firestore";
import { latestAvailabilityUpdate } from "./locationDetail";

const availability: Availability = {
  locationId: "location-one",
  sodaId: "soda-one",
  form: "can",
  sodaName: "Cola",
  sodaBrand: "Brand",
  sodaFlavor: "Original",
  canSample: "unknown",
  canPurchase: "unknown",
};

describe("latestAvailabilityUpdate", () => {
  it("returns the latest meaningful modification while ignoring legacy records", () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-09-26T12:00:00Z");

    expect(
      latestAvailabilityUpdate([
        availability,
        { ...availability, sodaId: "soda-two", updatedAt: later },
        { ...availability, sodaId: "soda-three", updatedAt: earlier },
      ]),
    ).toBe(later);
  });

  it("returns undefined when no availability has an update time", () => {
    expect(latestAvailabilityUpdate([availability])).toBeUndefined();
  });
});
