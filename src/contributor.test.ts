// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { publicContributorName } from "./contributor";

describe("publicContributorName", () => {
  it("prefers an intentional display name even when it resembles an email", () => {
    expect(
      publicContributorName({ displayName: " fan@example.com ", email: "private@example.com" }),
    ).toBe("fan@example.com");
  });

  it.each([
    ["fan@example.com", "fa…@example.com"],
    ["ab@example.com", "a…@example.com"],
    ["a@example.com", "…@example.com"],
  ])("redacts the local part of fallback email %s", (email, expected) => {
    expect(publicContributorName({ displayName: null, email })).toBe(expected);
  });

  it("omits attribution when no usable identity is available", () => {
    expect(publicContributorName({ displayName: " ", email: "not-an-email" })).toBeUndefined();
  });
});
