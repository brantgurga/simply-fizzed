// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, expect } from "vitest";

/** Return whether a form field has a valid native or ARIA label association. */
function hasLabel(field: Element): boolean {
  const ariaLabel = field.getAttribute("aria-label")?.trim();
  if (ariaLabel !== undefined && ariaLabel.length > 0) return true;

  const labelledBy = field.getAttribute("aria-labelledby")?.trim().split(/\s+/u) ?? [];
  if (labelledBy.length > 0 && labelledBy.every((id) => document.getElementById(id) !== null)) {
    return true;
  }

  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement
  ) {
    return (field.labels?.length ?? 0) > 0;
  }
  return false;
}

/** Catch form fields that trigger browser accessibility warnings because they have no label. */
afterEach(() => {
  try {
    const fields = document.querySelectorAll(
      'input:not([type="hidden"]), select, textarea:not([aria-hidden="true"]), [role="combobox"]',
    );
    for (const field of fields) {
      const identifier = field.getAttribute("id") ?? field.tagName.toLowerCase();
      expect(hasLabel(field), `Form field “${identifier}” must have a label`).toBe(true);
    }
  } finally {
    cleanup();
  }
});
