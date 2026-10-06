// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import PwaUpdatePrompt from "./PwaUpdatePrompt.tsx";
import { getStartupContent } from "./startup.ts";
import theme from "./theme.ts";

async function render() {
  const Content = await getStartupContent(window.location.hostname);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        <Content />
        <PwaUpdatePrompt />
      </ThemeProvider>
    </StrictMode>,
  );
}

void render();
