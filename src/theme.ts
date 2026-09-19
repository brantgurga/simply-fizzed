import { createTheme } from "@mui/material/styles";

export const rootBeerPalettes = {
  light: {
    palette: {
      primary: { main: "#6B3418", contrastText: "#FFF8E7" },
      secondary: { main: "#7A4E00", contrastText: "#FFF8E7" },
      background: { default: "#FFF8E7", paper: "#FFFDF7" },
      text: { primary: "#2A160D", secondary: "#5F402F" },
      divider: "#9A7350",
      success: { main: "#386641", contrastText: "#FFF8E7" },
      warning: { main: "#8A3F10", contrastText: "#FFF8E7" },
      error: { main: "#B3261E", contrastText: "#FFF8E7" },
      info: { main: "#2C6384", contrastText: "#FFF8E7" },
    },
  },
  dark: {
    palette: {
      primary: { main: "#FFD08A", contrastText: "#351A0D" },
      secondary: { main: "#D8A85F", contrastText: "#2A160D" },
      background: { default: "#1F100A", paper: "#2A160D" },
      text: { primary: "#F9E8C5", secondary: "#D8BE91" },
      divider: "#8B684D",
      success: { main: "#A5D6A7", contrastText: "#351A0D" },
      warning: { main: "#E6A73D", contrastText: "#351A0D" },
      error: { main: "#FFB4AB", contrastText: "#351A0D" },
      info: { main: "#90CAF9", contrastText: "#351A0D" },
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
