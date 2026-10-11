// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

/** Catch labels that trigger browser accessibility warnings because they reference no form field. */
afterEach(() => {
  try {
    for (const label of document.querySelectorAll("label")) {
      expect(
        label.control,
        `Label “${label.textContent ?? ""}” must reference a form field`,
      ).not.toBeNull();
    }
  } finally {
    cleanup();
  }
});
