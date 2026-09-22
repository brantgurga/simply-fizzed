import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { db } from "../firebase";
import { loadSoda, type DocumentLoad, type SodaDocument } from "./sodas";

interface SodaDetailProps {
  sodaId: string;
  loader?: (id: string) => Promise<DocumentLoad<SodaDocument>>;
}

type State = { status: "loading" } | { status: "error" } | DocumentLoad<SodaDocument>;

const defaultLoader = (id: string) => loadSoda(db, id);

export default function SodaDetail({ sodaId, loader = defaultLoader }: SodaDetailProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [request, setRequest] = useState({ sodaId, loader });

  if (request.sodaId !== sodaId || request.loader !== loader) {
    setRequest({ sodaId, loader });
    setState({ status: "loading" });
  }

  useEffect(() => {
    let active = true;
    loader(sodaId)
      .then((result) => {
        if (active) setState(result);
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [loader, sodaId]);

  if (state.status === "loading") {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <span>Loading soda…</span>
      </Stack>
    );
  }
  if (state.status === "error") {
    return <Alert severity="error">The soda could not be loaded. Please try again.</Alert>;
  }
  if (state.status === "missing") {
    return <Alert severity="warning">This soda could not be found.</Alert>;
  }
  if (state.status === "malformed") {
    return <Alert severity="error">This soda has malformed catalog data.</Alert>;
  }

  const soda = state.value;
  return (
    <Stack spacing={2}>
      <Link href="#/">← Back to browse</Link>
      <Typography variant="h4" component="h2">
        {soda.brand} {soda.name}
      </Typography>
      <Typography>
        <strong>Brand:</strong> {soda.brand}
      </Typography>
      <Typography>
        <strong>Name:</strong> {soda.name}
      </Typography>
      <Typography>
        <strong>Flavor:</strong> {soda.flavor}
      </Typography>
      <section aria-labelledby="aliases-heading">
        <Typography id="aliases-heading" variant="h6" component="h3">
          Aliases
        </Typography>
        {soda.aliases === undefined || soda.aliases.length === 0 ? (
          <Typography color="text.secondary">No aliases listed.</Typography>
        ) : (
          <List dense disablePadding>
            {soda.aliases.map((alias) => (
              <ListItem key={alias} disableGutters>
                {alias}
              </ListItem>
            ))}
          </List>
        )}
      </section>
    </Stack>
  );
}
