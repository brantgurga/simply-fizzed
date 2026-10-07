// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

export interface ContributorIdentity {
  displayName: string | null;
  email: string | null;
}

/** Return public attribution without exposing a fallback email address in full. */
export function publicContributorName(identity: ContributorIdentity): string | undefined {
  const displayName = identity.displayName?.trim();
  if (displayName) return displayName;

  const email = identity.email?.trim();
  if (!email) return undefined;
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return undefined;

  const localPart = email.slice(0, separator);
  const visibleLength = Math.min(2, Math.max(0, localPart.length - 1));
  return `${localPart.slice(0, visibleLength)}…${email.slice(separator)}`;
}
