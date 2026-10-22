// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it } from "vitest";
import { findModulePathCollisions } from "./module-path-collisions.js";

describe("module path collision policy", () => {
  it("rejects TypeScript modules that collide under extensionless case-insensitive resolution", () => {
    expect(
      findModulePathCollisions([
        "src/location/LocationDetail.tsx",
        "src/location/locationDetail.ts",
      ]),
    ).toEqual([
      "src/location/LocationDetail.tsx and src/location/locationDetail.ts resolve to the same case-insensitive extensionless module path",
    ]);
  });

  it("rejects tracked paths that differ only by case", () => {
    expect(findModulePathCollisions(["src/Foo.ts", "src/foo.ts"])).toEqual([
      "src/Foo.ts and src/foo.ts differ only by case",
    ]);
  });

  it("allows distinct module names", () => {
    expect(
      findModulePathCollisions([
        "src/location/LocationDetail.tsx",
        "src/location/locationDetailData.ts",
      ]),
    ).toEqual([]);
  });
});
