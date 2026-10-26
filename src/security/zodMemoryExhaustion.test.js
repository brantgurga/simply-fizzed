// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const firebaseUiPackages = ["@firebase-oss/ui-core", "@firebase-oss/ui-react"];

const loadZodFor = async (packageName) => {
  const packageRequire = createRequire(require.resolve(packageName));
  return import(pathToFileURL(packageRequire.resolve("zod")).href);
};

describe("Zod collection validation security", () => {
  it.each(firebaseUiPackages)(
    "%s rejects an oversized array before validating its elements",
    async (packageName) => {
      const { z } = await loadZodFor(packageName);
      const validateElement = vi.fn(() => false);
      const schema = z.array(z.unknown().refine(validateElement)).max(100);

      const result = schema.safeParse(Array.from({ length: 50_000 }, () => null));

      expect(result.error?.issues).toMatchObject([{ code: "too_big" }]);
      expect(validateElement).not.toHaveBeenCalled();
    },
  );
});
