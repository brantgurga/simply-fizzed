// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import type { ComponentType } from "react";
import ComingSoon from "./ComingSoon";
import { isFullAppEnabled } from "./firebase";

export async function getStartupContent(hostname: string): Promise<ComponentType> {
  if (!(await isFullAppEnabled(hostname))) return ComingSoon;

  return (await import("./App")).default;
}
