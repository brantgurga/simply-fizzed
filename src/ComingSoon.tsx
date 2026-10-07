// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BrandFooter from "./BrandFooter";
import { brand } from "./branding";

function ComingSoon() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Container
        component="main"
        maxWidth="sm"
        sx={{ alignItems: "center", display: "flex", flex: 1, textAlign: "center" }}
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
        </Stack>
      </Container>
      <BrandFooter />
    </Box>
  );
}

export default ComingSoon;
