import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { User } from "firebase/auth";
import {
  addAvailability,
  addNewSodaAvailability,
  DuplicateAvailabilityError,
  type NewSodaAvailability,
} from "../availability/addAvailability";
import AvailabilityForm from "../availability/AvailabilityForm";
import { publicContributorName } from "../contributor";
import { db } from "../firebase";
import type { Availability, Soda, SodaForm } from "../model/firestore";
import { formatAddress, formatSodaAvailability } from "../nearby/results";
import { sodaRoute } from "../routes";
import { loadSodaCatalog, type DocumentLoad, type SodaDocument } from "../soda/sodas";
import type { LocationDoc } from "../nearby/distance";
import { loadLocation, loadLocationAvailability, type AvailabilityLoad } from "./locationDetail";

type ContributionUser = Pick<User, "uid" | "displayName" | "email">;

interface LocationDetailProps {
  locationId: string;
  user: ContributionUser | null;
  onSignIn: () => void;
  locationLoader?: (id: string) => Promise<DocumentLoad<LocationDoc>>;
  availabilityLoader?: (id: string) => Promise<AvailabilityLoad>;
  catalogLoader?: () => Promise<SodaDocument[]>;
  availabilityWriter?: (
    locationId: string,
    sodaId: string,
    form: SodaForm,
    user: ContributionUser,
  ) => Promise<Availability>;
  newSodaAvailabilityWriter?: (
    locationId: string,
    soda: Soda,
    form: SodaForm,
    user: ContributionUser,
  ) => Promise<NewSodaAvailability>;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      location: DocumentLoad<LocationDoc>;
      availability: AvailabilityLoad;
    };

const defaultLocationLoader = (id: string) => loadLocation(db, id);
const defaultAvailabilityLoader = (id: string) => loadLocationAvailability(db, id);
const defaultCatalogLoader = () => loadSodaCatalog(db);
const contributorFor = (user: ContributionUser) => {
  const name = publicContributorName(user);
  return { id: user.uid, ...(name === undefined ? {} : { name }) };
};

const defaultAvailabilityWriter = (
  locationId: string,
  sodaId: string,
  form: SodaForm,
  user: ContributionUser,
) => addAvailability(db, locationId, sodaId, form, contributorFor(user));

const defaultNewSodaAvailabilityWriter = (
  locationId: string,
  soda: Soda,
  form: SodaForm,
  user: ContributionUser,
) => addNewSodaAvailability(db, locationId, soda, form, contributorFor(user));

export default function LocationDetail({
  locationId,
  user,
  onSignIn,
  locationLoader = defaultLocationLoader,
  availabilityLoader = defaultAvailabilityLoader,
  catalogLoader = defaultCatalogLoader,
  availabilityWriter = defaultAvailabilityWriter,
  newSodaAvailabilityWriter = defaultNewSodaAvailabilityWriter,
}: LocationDetailProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [request, setRequest] = useState({ locationId, locationLoader, availabilityLoader });

  if (
    request.locationId !== locationId ||
    request.locationLoader !== locationLoader ||
    request.availabilityLoader !== availabilityLoader
  ) {
    setRequest({ locationId, locationLoader, availabilityLoader });
    setState({ status: "loading" });
  }

  useEffect(() => {
    let active = true;
    Promise.all([locationLoader(locationId), availabilityLoader(locationId)])
      .then(([location, availability]) => {
        if (active) setState({ status: "ready", location, availability });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [availabilityLoader, locationId, locationLoader]);

  if (state.status === "loading") {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <span>Loading location…</span>
      </Stack>
    );
  }
  if (state.status === "error") {
    return <Alert severity="error">The location could not be loaded. Please try again.</Alert>;
  }
  if (state.location.status === "missing") {
    return <Alert severity="warning">This location could not be found.</Alert>;
  }
  if (state.location.status === "malformed") {
    return <Alert severity="error">This location has malformed data.</Alert>;
  }

  const location = state.location.value;
  const add = async (soda: SodaDocument | Soda, form: SodaForm) => {
    if (user === null) throw new Error("Sign in to contribute.");
    let added: Availability;
    let catalogSoda: SodaDocument;
    if ("id" in soda) {
      if (state.availability.items.some((item) => item.sodaId === soda.id && item.form === form)) {
        throw new DuplicateAvailabilityError();
      }
      added = await availabilityWriter(locationId, soda.id, form, user);
      catalogSoda = soda;
    } else {
      const result = await newSodaAvailabilityWriter(locationId, soda, form, user);
      added = result.availability;
      catalogSoda = result.soda;
    }

    setState((current) =>
      current.status === "ready" &&
      current.location.status === "found" &&
      current.location.value.id === locationId
        ? {
            ...current,
            availability: {
              ...current.availability,
              items: [...current.availability.items, added],
            },
          }
        : current,
    );
    return catalogSoda;
  };

  return (
    <Stack spacing={2}>
      <Link href="#/">← Back to browse</Link>
      <Typography variant="h4" component="h2">
        {location.name}
      </Typography>
      <Typography color="text.secondary">{formatAddress(location.address)}</Typography>
      <Typography variant="h5" component="h3">
        Available sodas
      </Typography>
      {state.availability.malformedCount > 0 && (
        <Alert severity="warning">Some malformed availability entries were not shown.</Alert>
      )}
      {state.availability.items.length === 0 ? (
        <Typography color="text.secondary">No sodas listed yet.</Typography>
      ) : (
        <List dense disablePadding>
          {state.availability.items.map((item) => (
            <ListItem key={`${item.sodaId}-${item.form}`} disableGutters>
              <Link href={sodaRoute(item.sodaId)}>{formatSodaAvailability(item)}</Link>
            </ListItem>
          ))}
        </List>
      )}
      {user === null ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={onSignIn}>
              Sign in
            </Button>
          }
        >
          Sign in to contribute soda availability.
        </Alert>
      ) : (
        <AvailabilityForm onAdd={add} loadCatalog={catalogLoader} />
      )}
    </Stack>
  );
}
