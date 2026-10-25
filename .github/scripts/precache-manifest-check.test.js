// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { validateFontPrecache } from "./precache-manifest-check.js";

const expectedFonts = [300, 400, 500, 700]
  .map((weight) => `{url:"assets/roboto-latin-${weight}-normal-hash.woff2",revision:null}`)
  .join(",");

describe("font precache manifest check", () => {
  it("accepts exactly the four supported Latin WOFF2 faces", () => {
    expect(validateFontPrecache(`precacheAndRoute([${expectedFonts}])`)).toEqual([]);
  });

  it("rejects redundant WOFF entries", () => {
    const errors = validateFontPrecache(
      `precacheAndRoute([${expectedFonts},{url:"assets/roboto-latin-400-normal-hash.woff",revision:null}])`,
    );

    expect(errors).toContain("WOFF files are precached: assets/roboto-latin-400-normal-hash.woff");
  });

  it("rejects unsupported subsets and missing expected weights", () => {
    const errors = validateFontPrecache(
      'precacheAndRoute([{url:"assets/roboto-cyrillic-400-normal-hash.woff2",revision:null}])',
    );

    expect(errors).toContain(
      "Unexpected WOFF2 file is precached: assets/roboto-cyrillic-400-normal-hash.woff2",
    );
    expect(errors).toContain("Missing Latin WOFF2 weights: 300, 400, 500, 700");
    expect(errors).toContain("Expected 4 WOFF2 files, found 1");
  });
});
