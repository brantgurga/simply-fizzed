// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { brand } from "./branding";
import { browserThemeColors } from "./theme-tokens";

describe("branding configuration", () => {
  it("keeps install metadata and legal links centralized", () => {
    expect(brand.name).toBe("Simply Fizzed");
    expect(brand.icons).toContainEqual(
      expect.objectContaining({ src: brand.appleTouchIcon, sizes: "192x192" }),
    );
    expect(brand.issuesUrl).toBe(`${brand.sourceUrl}/issues`);
    expect(brand.licenseUrl).toBe(`${brand.sourceUrl}/blob/main/LICENSE`);
  });

  it("provides browser and PWA theme colors from shared tokens", () => {
    expect(browserThemeColors.light).toMatch(/^#[\dA-F]{6}$/u);
    expect(browserThemeColors.dark).toMatch(/^#[\dA-F]{6}$/u);
    expect(browserThemeColors.background).toMatch(/^#[\dA-F]{6}$/u);
  });
});
