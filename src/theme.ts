// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { createTheme } from "@mui/material/styles";
import { brandColors } from "./theme-tokens";

export const rootBeerPalettes = {
  light: {
    palette: {
      primary: { main: brandColors.rootBeer, contrastText: brandColors.cream },
      secondary: { main: brandColors.caramel, contrastText: brandColors.cream },
      background: { default: brandColors.cream, paper: brandColors.froth },
      text: { primary: brandColors.darkChocolate, secondary: brandColors.toastedCocoa },
      divider: brandColors.oak,
      success: { main: brandColors.bottleGreen, contrastText: brandColors.cream },
      warning: { main: brandColors.copper, contrastText: brandColors.cream },
      error: { main: brandColors.cherryRed, contrastText: brandColors.cream },
      info: { main: brandColors.sodaBlue, contrastText: brandColors.cream },
    },
  },
  dark: {
    palette: {
      primary: { main: brandColors.amber, contrastText: brandColors.molasses },
      secondary: { main: brandColors.butterscotch, contrastText: brandColors.darkChocolate },
      background: { default: brandColors.espresso, paper: brandColors.darkChocolate },
      text: { primary: brandColors.creamFoam, secondary: brandColors.mutedFoam },
      divider: brandColors.smokedOak,
      success: { main: brandColors.mintGreen, contrastText: brandColors.molasses },
      warning: { main: brandColors.goldenOrange, contrastText: brandColors.molasses },
      error: { main: brandColors.paleCherry, contrastText: brandColors.molasses },
      info: { main: brandColors.paleBlue, contrastText: brandColors.molasses },
    },
  },
} as const;

const theme = createTheme({
  cssVariables: true,
  colorSchemes: rootBeerPalettes,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          // FirebaseUI ships in a CSS layer, so these unlayered overrides win and
          // resolve through the same media-selected MUI scheme as the app.
          "--fui-primary": "var(--mui-palette-primary-main)",
          "--fui-primary-hover": "var(--mui-palette-primary-dark)",
          "--fui-primary-surface": "var(--mui-palette-primary-contrastText)",
          "--fui-text": "var(--mui-palette-text-primary)",
          "--fui-text-muted": "var(--mui-palette-text-secondary)",
          "--fui-background": "var(--mui-palette-background-paper)",
          "--fui-border": "var(--mui-palette-divider)",
          "--fui-input": "var(--mui-palette-divider)",
          "--fui-error": "var(--mui-palette-error-main)",
        },
        ".catalog-map-popup__container": {
          cursor: "auto",
          height: 0,
          position: "absolute",
          width: 240,
        },
        ".catalog-map-popup__anchor": {
          bottom: 14,
          left: 0,
          position: "absolute",
          width: "100%",
        },
        ".catalog-map-popup__anchor::after": {
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderTop: "10px solid var(--mui-palette-background-paper)",
          content: '""',
          height: 0,
          left: 0,
          position: "absolute",
          top: 0,
          transform: "translateX(-50%)",
          width: 0,
        },
        ".catalog-map-popup": {
          backgroundColor: "var(--mui-palette-background-paper)",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgb(0 0 0 / 40%)",
          color: "var(--mui-palette-text-primary)",
          left: 0,
          maxHeight: 240,
          overflowY: "auto",
          padding: "12px 32px 12px 12px",
          position: "absolute",
          top: 0,
          transform: "translate(-50%, -100%)",
          width: 240,
        },
        ".catalog-map-popup a": {
          color: "var(--mui-palette-primary-main)",
        },
        ".catalog-map-popup__close": {
          background: "transparent",
          border: 0,
          color: "var(--mui-palette-text-primary)",
          cursor: "pointer",
          fontSize: 24,
          lineHeight: 1,
          padding: 4,
          position: "absolute",
          right: 2,
          top: 2,
        },
      },
    },
  },
});

export default theme;
