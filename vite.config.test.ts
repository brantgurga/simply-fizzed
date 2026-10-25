// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("src/main.tsx", "utf8");
const indexSource = readFileSync("index.html", "utf8");

describe("Roboto font configuration", () => {
  it("bundles only the used Latin weights", () => {
    const stylesheets = [...mainSource.matchAll(/@fontsource\/roboto\/([^".]+)\.css/gu)].map(
      ([, stylesheet]) => stylesheet,
    );

    expect(stylesheets).toEqual(["latin-400", "latin-500", "latin-700"]);
  });

  it("preloads the primary face with the required font metadata", () => {
    const html = new DOMParser().parseFromString(indexSource, "text/html");
    const preloads = html.querySelectorAll('link[rel="preload"][as="font"]');

    expect(preloads).toHaveLength(1);
    expect(preloads[0]?.getAttribute("href")).toBe(
      "/node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff2",
    );
    expect(preloads[0]?.getAttribute("type")).toBe("font/woff2");
    expect(preloads[0]?.hasAttribute("crossorigin")).toBe(true);
  });
});
