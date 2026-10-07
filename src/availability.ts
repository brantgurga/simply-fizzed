// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

export function isHostnameEnabled(hostname: string, enabledHostnames: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  return enabledHostnames
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .some((entry) => entry.length > 0 && entry === normalizedHostname);
}
