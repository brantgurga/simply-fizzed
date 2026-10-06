// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

export const brandColors = {
  espresso: "#1F100A",
  darkChocolate: "#2A160D",
  molasses: "#351A0D",
  toastedCocoa: "#5F402F",
  rootBeer: "#6B3418",
  caramel: "#7A4E00",
  copper: "#8A3F10",
  oak: "#9A7350",
  bottleGreen: "#386641",
  cherryRed: "#B3261E",
  sodaBlue: "#2C6384",
  cream: "#FFF8E7",
  froth: "#FFFDF7",
  amber: "#FFD08A",
  butterscotch: "#D8A85F",
  creamFoam: "#F9E8C5",
  mutedFoam: "#D8BE91",
  smokedOak: "#8B684D",
  mintGreen: "#A5D6A7",
  goldenOrange: "#E6A73D",
  paleCherry: "#FFB4AB",
  paleBlue: "#90CAF9",
} as const;

export const browserThemeColors = {
  light: brandColors.rootBeer,
  dark: brandColors.espresso,
  background: brandColors.cream,
} as const;
