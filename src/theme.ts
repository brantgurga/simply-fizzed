import { createTheme } from "@mui/material/styles";

// FirebaseUI follows the device's preferred color scheme. Supplying both MUI
// schemes makes the surrounding page and native controls follow that same
// preference instead of leaving a dark FirebaseUI card on a light page.
const theme = createTheme({
  cssVariables: true,
  colorSchemes: {
    light: {
      palette: { primary: { main: "#aa3bff" } },
    },
    dark: {
      palette: { primary: { main: "#aa3bff" } },
    },
  },
});

export default theme;
