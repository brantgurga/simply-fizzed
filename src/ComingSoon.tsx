import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

function ComingSoon() {
  return (
    <Container
      component="main"
      maxWidth="sm"
      sx={{ alignItems: "center", display: "flex", minHeight: "100vh", textAlign: "center" }}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        <Typography component="h1" variant="h3">
          Simply Fizzed
        </Typography>
        <Typography component="h2" variant="h5">
          Coming soon
        </Typography>
        <Typography color="text.secondary">
          We’re putting the finishing touches on a better way to find your favorite sodas.
        </Typography>
      </Stack>
    </Container>
  );
}

export default ComingSoon;
