// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { brand } from "./branding";

function ComingSoon() {
  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ alignItems: "center", display: "flex", minHeight: "100vh", textAlign: "center" }}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Typography component="h1" variant="h3">
          {brand.name}
        </Typography>
        <Typography component="h2" variant="h5">
          Coming soon
        </Typography>
        <Typography color="text.secondary">
          We’re putting the finishing touches on a better way to find your favorite sodas.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
          <Link href={brand.sourceUrl}>Source</Link>
          <Link href={brand.licenseUrl}>AGPL-3.0-only license</Link>
        </Stack>
      </Stack>
    </Container>
  );
}

export default ComingSoon;
