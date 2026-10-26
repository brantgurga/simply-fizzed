// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("Zod collection validation security", () => {
  it("rejects an oversized array before validating its elements", () => {
    const validateElement = vi.fn(() => false);
    const schema = z.array(z.unknown().refine(validateElement)).max(100);

    const result = schema.safeParse(Array.from({ length: 50_000 }, () => null));

    expect(result.error?.issues).toMatchObject([{ code: "too_big" }]);
    expect(validateElement).not.toHaveBeenCalled();
  });
});
