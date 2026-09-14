import { createTheme } from "@mui/material/styles";

// Central Material UI theme. `cssVariables` opts into MUI's CSS theme variables,
// the recommended default in current Material UI, which also lets CssBaseline's
// `enableColorScheme` drive native light/dark elements. `fontFamily` matches the
// Roboto weights self-hosted via `@fontsource/roboto` and imported in main.tsx.
const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: "#aa3bff" },
  },
});

export default theme;
