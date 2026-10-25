// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("src/main.tsx", "utf8");
const viteConfigSource = readFileSync("vite.config.ts", "utf8");

describe("Roboto precache configuration", () => {
  it("bundles only the supported Latin subset", () => {
    const stylesheets = [...mainSource.matchAll(/@fontsource\/roboto\/([^".]+)\.css/gu)].map(
      ([, stylesheet]) => stylesheet,
    );

    expect(stylesheets).toEqual(["latin-300", "latin-400", "latin-500", "latin-700"]);
  });

  it("precaches WOFF2 without the redundant WOFF format", () => {
    const globPatterns = viteConfigSource
      .split("\n")
      .find((line) => line.includes("globPatterns:"));

    expect(globPatterns).toContain("woff2");
    expect(globPatterns).not.toMatch(/\bwoff\b/u);
  });
});
