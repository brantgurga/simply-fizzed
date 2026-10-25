// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// @ts-check

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPECTED_WEIGHTS = ["300", "400", "500", "700"];
const LATIN_WOFF2_PATTERN =
  /^assets\/roboto-latin-(300|400|500|700)-normal-[A-Za-z0-9_-]+\.woff2$/u;

/** @param {string} serviceWorker */
export function validateFontPrecache(serviceWorker) {
  const errors = [];
  /** @type {string[]} */
  const fontUrls = [];
  for (const match of serviceWorker.matchAll(/\burl:"([^"]+\.woff2?)"/gu)) {
    const url = match[1];
    if (url !== undefined) fontUrls.push(url);
  }
  const woffUrls = fontUrls.filter((url) => url.endsWith(".woff"));
  const woff2Urls = fontUrls.filter((url) => url.endsWith(".woff2"));
  const weights = new Set();

  if (woffUrls.length > 0) errors.push(`WOFF files are precached: ${woffUrls.join(", ")}`);

  for (const url of woff2Urls) {
    const weight = LATIN_WOFF2_PATTERN.exec(url)?.[1];
    if (weight === undefined) errors.push(`Unexpected WOFF2 file is precached: ${url}`);
    else weights.add(weight);
  }

  const missingWeights = EXPECTED_WEIGHTS.filter((weight) => !weights.has(weight));
  if (missingWeights.length > 0) {
    errors.push(`Missing Latin WOFF2 weights: ${missingWeights.join(", ")}`);
  }
  if (woff2Urls.length !== EXPECTED_WEIGHTS.length) {
    errors.push(`Expected 4 WOFF2 files, found ${woff2Urls.length}`);
  }

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const serviceWorkerPath = process.argv[2] ?? "dist/sw.js";
  const errors = validateFontPrecache(readFileSync(serviceWorkerPath, "utf8"));

  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Precache contains only the four expected Latin Roboto WOFF2 files.");
  }
}
