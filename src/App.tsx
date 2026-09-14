import AppBar from "@mui/material/AppBar";
import Container from "@mui/material/Container";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="h1">
            Simply Fizzed
          </Typography>
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          Find soda near you. Search is coming soon.
        </Typography>
      </Container>
    </>
  );
}

export default App;
