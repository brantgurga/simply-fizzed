import { useEffect, useState } from "react";
import SportsBarIcon from "@mui/icons-material/SportsBar";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { publicContributorName, type ContributorIdentity } from "../contributor";
import { db } from "../firebase";
import {
  loadSampling,
  saveSampling,
  type SamplingLoad,
  type SamplingValue,
} from "../sampling/sampling";
import { formatSodaUpdatedAt, loadSoda, type DocumentLoad, type SodaDocument } from "./sodas";

interface SodaDetailProps {
  sodaId: string;
  user?: ({ uid: string } & ContributorIdentity) | null;
  onSignIn?: () => void;
  loader?: (id: string) => Promise<DocumentLoad<SodaDocument>>;
  samplingLoader?: (userId: string, sodaId: string) => Promise<SamplingLoad>;
  samplingSaver?: (
    userId: string,
    publicName: string,
    soda: SodaDocument,
    value: SamplingValue,
  ) => Promise<void>;
}

type State = { status: "loading" } | { status: "error" } | DocumentLoad<SodaDocument>;

const defaultLoader = (id: string) => loadSoda(db, id);

function AttributionValue({ value }: { value: string | undefined }) {
  return (
    <Typography
      component="span"
      variant="inherit"
      color={value === undefined ? "text.disabled" : undefined}
      style={value === undefined ? { fontStyle: "italic" } : undefined}
    >
      {value ?? "Unknown"}
    </Typography>
  );
}

const defaultSamplingLoader = (userId: string, sodaId: string) => loadSampling(db, userId, sodaId);
const noop = () => undefined;
const defaultSamplingSaver = (
  userId: string,
  publicName: string,
  soda: SodaDocument,
  value: SamplingValue,
) => saveSampling(db, userId, publicName, soda, value);
const ratingLabel = (value: number) => {
  const meanings = ["Disliked", "Below average", "Acceptable", "Really liked", "Loved"];
  return `${value} mug${value === 1 ? "" : "s"}: ${meanings[value - 1] ?? ""}`;
};

type SamplingState =
  | { status: "loading" }
  | { status: "ready"; value: SamplingValue }
  | { status: "error" };

function SamplingControls({
  soda,
  user,
  onSignIn,
  loader,
  saver,
}: {
  soda: SodaDocument;
  user: ({ uid: string } & ContributorIdentity) | null;
  onSignIn: () => void;
  loader: (userId: string, sodaId: string) => Promise<SamplingLoad>;
  saver: (
    userId: string,
    publicName: string,
    soda: SodaDocument,
    value: SamplingValue,
  ) => Promise<void>;
}) {
  const [state, setState] = useState<SamplingState>(() =>
    user === null ? { status: "ready", value: undefined } : { status: "loading" },
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [request, setRequest] = useState({ userId: user?.uid, sodaId: soda.id, loader });

  if (request.userId !== user?.uid || request.sodaId !== soda.id || request.loader !== loader) {
    setRequest({ userId: user?.uid, sodaId: soda.id, loader });
    setState(user === null ? { status: "ready", value: undefined } : { status: "loading" });
  }

  useEffect(() => {
    if (user === null) return undefined;

    let active = true;
    loader(user.uid, soda.id)
      .then((result) => {
        if (!active) return;
        if (result.status === "missing") setState({ status: "ready", value: undefined });
        else if (result.status === "found")
          setState({ status: "ready", value: result.value.rating });
        else setState({ status: "error" });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [loader, soda.id, user]);

  if (user === null) {
    return (
      <Stack component="section" spacing={1} aria-labelledby="sampling-heading">
        <Typography id="sampling-heading" variant="h6" component="h3">
          Your sampling
        </Typography>
        <Typography color="text.secondary">Sign in to track and rate sodas you've had.</Typography>
        <Button variant="outlined" onClick={onSignIn} sx={{ alignSelf: "flex-start" }}>
          Sign in to track this soda
        </Button>
      </Stack>
    );
  }
  if (state.status === "loading")
    return <CircularProgress size={20} aria-label="Loading sampling" />;
  if (state.status === "error") {
    return <Alert severity="error">Your sampling information could not be loaded.</Alert>;
  }

  const persist = async (value: SamplingValue) => {
    const previous = state.value;
    setState({ status: "ready", value });
    setSaving(true);
    setSaveError(false);
    try {
      await saver(user.uid, publicContributorName(user) ?? "", soda, value);
    } catch {
      setState({ status: "ready", value: previous });
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  const sampled = state.value !== undefined;
  const rating = typeof state.value === "number" ? state.value : null;

  return (
    <Stack component="section" spacing={1} aria-labelledby="sampling-heading">
      <Typography id="sampling-heading" variant="h6" component="h3">
        Your sampling
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={sampled}
            disabled={saving}
            onChange={(_event, checked) => void persist(checked ? null : undefined)}
          />
        }
        label="I've had this"
      />
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Rating
          aria-label="Your mug rating"
          value={rating}
          max={5}
          precision={1}
          disabled={saving}
          icon={<SportsBarIcon fontSize="inherit" />}
          emptyIcon={<SportsBarIcon fontSize="inherit" />}
          getLabelText={ratingLabel}
          onChange={(_event, value) => {
            if (value !== null && Number.isInteger(value) && value >= 1 && value <= 5) {
              void persist(value);
            }
          }}
        />
        <Button disabled={saving || rating === null} onClick={() => void persist(null)}>
          Clear rating
        </Button>
      </Stack>
      {saving && <Typography color="text.secondary">Saving…</Typography>}
      {saveError && (
        <Alert severity="error">Your sampling could not be saved. Please try again.</Alert>
      )}
    </Stack>
  );
}

export default function SodaDetail({
  sodaId,
  user = null,
  onSignIn = noop,
  loader = defaultLoader,
  samplingLoader = defaultSamplingLoader,
  samplingSaver = defaultSamplingSaver,
}: SodaDetailProps) {
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
      <SamplingControls
        soda={soda}
        user={user}
        onSignIn={onSignIn}
        loader={samplingLoader}
        saver={samplingSaver}
      />
      <Typography color="text.secondary">
        Last updated:{" "}
        <AttributionValue
          value={soda.updatedAt === undefined ? undefined : formatSodaUpdatedAt(soda.updatedAt)}
        />
      </Typography>
      <Typography color="text.secondary">
        Last updated by: <AttributionValue value={soda.updatedByName} />
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
