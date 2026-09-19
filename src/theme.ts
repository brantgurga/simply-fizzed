import { createTheme } from "@mui/material/styles";

const colors = {
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

export const rootBeerPalettes = {
  light: {
    palette: {
      primary: { main: colors.rootBeer, contrastText: colors.cream },
      secondary: { main: colors.caramel, contrastText: colors.cream },
      background: { default: colors.cream, paper: colors.froth },
      text: { primary: colors.darkChocolate, secondary: colors.toastedCocoa },
      divider: colors.oak,
      success: { main: colors.bottleGreen, contrastText: colors.cream },
      warning: { main: colors.copper, contrastText: colors.cream },
      error: { main: colors.cherryRed, contrastText: colors.cream },
      info: { main: colors.sodaBlue, contrastText: colors.cream },
    },
  },
  dark: {
    palette: {
      primary: { main: colors.amber, contrastText: colors.molasses },
      secondary: { main: colors.butterscotch, contrastText: colors.darkChocolate },
      background: { default: colors.espresso, paper: colors.darkChocolate },
      text: { primary: colors.creamFoam, secondary: colors.mutedFoam },
      divider: colors.smokedOak,
      success: { main: colors.mintGreen, contrastText: colors.molasses },
      warning: { main: colors.goldenOrange, contrastText: colors.molasses },
      error: { main: colors.paleCherry, contrastText: colors.molasses },
      info: { main: colors.paleBlue, contrastText: colors.molasses },
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
      },
    },
  },
});

export default theme;
