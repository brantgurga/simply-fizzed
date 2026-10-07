// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import { brand } from "./branding";

function BrandFooter() {
  return (
    <Box component="footer" sx={{ py: 2, textAlign: "center" }}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
        <Link href={brand.sourceUrl}>Source</Link>
        <Link href={brand.licenseUrl}>AGPL-3.0-only license</Link>
      </Stack>
    </Box>
  );
}

export default BrandFooter;
