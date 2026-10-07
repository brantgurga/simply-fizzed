// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { isHostnameEnabled } from "./availability";

describe("isHostnameEnabled", () => {
  it("enables an exactly listed hostname", () => {
    expect(
      isHostnameEnabled(
        "simply-fizzed-prod--staging.example.web.app",
        "simply-fizzed-prod--staging.example.web.app, another.example.com",
      ),
    ).toBe(true);
  });

  it("rejects a hostname that is not listed", () => {
    expect(isHostnameEnabled("simply-fizzed.example.com", "staging.example.com")).toBe(false);
  });

  it("ignores empty and whitespace-only entries", () => {
    expect(isHostnameEnabled("simply-fizzed.example.com", " , ,\t")).toBe(false);
  });

  it("matches hostnames case-insensitively and trims whitespace", () => {
    expect(
      isHostnameEnabled(" STAGING.Example.COM ", " other.example.com, staging.example.com "),
    ).toBe(true);
  });
});
