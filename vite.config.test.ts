// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firebaseStartupPreconnectTags } from "./vite.config";

const mainSource = readFileSync("src/main.tsx", "utf8");

describe("Roboto font configuration", () => {
  it("bundles only the supported Latin subset", () => {
    const stylesheets = [...mainSource.matchAll(/@fontsource\/roboto\/([^".]+)\.css/gu)].map(
      ([, stylesheet]) => stylesheet,
    );

    expect(stylesheets).toEqual(["latin-300", "latin-400", "latin-500", "latin-700"]);
  });
});

describe("Firebase startup preconnects", () => {
  it("warms only the production origins on the startup critical path", () => {
    expect(firebaseStartupPreconnectTags("simply-fizzed")).toEqual([
      { tag: "link", attrs: { rel: "preconnect", href: "https://www.google.com" } },
      {
        tag: "link",
        attrs: {
          rel: "preconnect",
          href: "https://firebaseinstallations.googleapis.com",
          crossorigin: true,
        },
      },
      {
        tag: "link",
        attrs: {
          rel: "preconnect",
          href: "https://firebaseremoteconfig.googleapis.com",
          crossorigin: true,
        },
      },
    ]);
  });

  it.each([undefined, "demo-simply-fizzed"])(
    "omits production preconnects for project %s",
    (projectId) => {
      expect(firebaseStartupPreconnectTags(projectId)).toEqual([]);
    },
  );
});
