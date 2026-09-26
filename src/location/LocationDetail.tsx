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
  type AvailabilityDetails,
  type NewSodaAvailability,
  type QueuedWrite,
  updateAvailabilityDetails,
} from "../availability/addAvailability";
import { AvailabilityDetailsEditor } from "../availability/AvailabilityDetails";
import AvailabilityForm from "../availability/AvailabilityForm";
import { publicContributorName } from "../contributor";
import { db } from "../firebase";
import type { Availability, Soda, SodaForm, Verification } from "../model/firestore";
import { formatAddress, formatLocationUpdatedAt, formatSodaAvailability } from "../nearby/results";
import { sodaRoute } from "../routes";
import { loadSodaCatalog, type DocumentLoad, type SodaDocument } from "../soda/sodas";
import type { LocationDoc } from "../nearby/distance";
import {
  latestAvailabilityUpdate,
  loadLocation,
  loadLocationAvailability,
  type AvailabilityLoad,
} from "./locationDetail";
import {
  compareVerifications,
  confirmLocationAvailability,
  loadLatestVerification,
  type VerificationLoad,
} from "./locationVerification";

type ContributionUser = Pick<User, "uid" | "displayName" | "email">;

interface LocationDetailProps {
  locationId: string;
  user: ContributionUser | null;
  onSignIn: () => void;
  locationLoader?: (id: string) => Promise<DocumentLoad<LocationDoc>>;
  availabilityLoader?: (id: string) => Promise<AvailabilityLoad>;
  verificationLoader?: (id: string) => Promise<VerificationLoad>;
  catalogLoader?: () => Promise<SodaDocument[]>;
  availabilityWriter?: (
    locationId: string,
    soda: SodaDocument,
    form: SodaForm,
    details: AvailabilityDetails,
    user: ContributionUser,
  ) => QueuedWrite<Availability>;
  newSodaAvailabilityWriter?: (
    locationId: string,
    soda: Soda,
    form: SodaForm,
    details: AvailabilityDetails,
    user: ContributionUser,
  ) => QueuedWrite<NewSodaAvailability>;
  availabilityUpdater?: (
    availability: Availability,
    details: AvailabilityDetails,
    user: ContributionUser,
  ) => QueuedWrite<Availability>;
  verificationWriter?: (locationId: string, user: ContributionUser) => QueuedWrite<Verification>;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      location: DocumentLoad<LocationDoc>;
      availability: AvailabilityLoad;
      verification: VerificationLoad;
    };

const defaultLocationLoader = (id: string) => loadLocation(db, id);
const defaultAvailabilityLoader = (id: string) => loadLocationAvailability(db, id);
const defaultVerificationLoader = (id: string) => loadLatestVerification(db, id);
const defaultCatalogLoader = () => loadSodaCatalog(db);
const contributorFor = (user: ContributionUser) => {
  const name = publicContributorName(user);
  return { id: user.uid, ...(name === undefined ? {} : { name }) };
};

const defaultAvailabilityWriter = (
  locationId: string,
  soda: SodaDocument,
  form: SodaForm,
  details: AvailabilityDetails,
  user: ContributionUser,
) => addAvailability(db, locationId, soda, form, details, contributorFor(user));

const defaultNewSodaAvailabilityWriter = (
  locationId: string,
  soda: Soda,
  form: SodaForm,
  details: AvailabilityDetails,
  user: ContributionUser,
) => addNewSodaAvailability(db, locationId, soda, form, details, contributorFor(user));

const defaultAvailabilityUpdater = (
  availability: Availability,
  details: AvailabilityDetails,
  user: ContributionUser,
) => updateAvailabilityDetails(db, availability, details, contributorFor(user));

const defaultVerificationWriter = (locationId: string, user: ContributionUser) =>
  confirmLocationAvailability(db, locationId, contributorFor(user));

export default function LocationDetail({
  locationId,
  user,
  onSignIn,
  locationLoader = defaultLocationLoader,
  availabilityLoader = defaultAvailabilityLoader,
  verificationLoader = defaultVerificationLoader,
  catalogLoader = defaultCatalogLoader,
  availabilityWriter = defaultAvailabilityWriter,
  newSodaAvailabilityWriter = defaultNewSodaAvailabilityWriter,
  availabilityUpdater = defaultAvailabilityUpdater,
  verificationWriter = defaultVerificationWriter,
}: LocationDetailProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [writeError, setWriteError] = useState<string>();
  const [confirmationMessage, setConfirmationMessage] = useState<string>();
  const [request, setRequest] = useState({
    locationId,
    locationLoader,
    availabilityLoader,
    verificationLoader,
  });

  if (
    request.locationId !== locationId ||
    request.locationLoader !== locationLoader ||
    request.availabilityLoader !== availabilityLoader ||
    request.verificationLoader !== verificationLoader
  ) {
    setRequest({ locationId, locationLoader, availabilityLoader, verificationLoader });
    setState({ status: "loading" });
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      locationLoader(locationId),
      availabilityLoader(locationId),
      verificationLoader(locationId),
    ])
      .then(([location, availability, verification]) => {
        if (active) setState({ status: "ready", location, availability, verification });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [availabilityLoader, locationId, locationLoader, verificationLoader]);

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
  const awaitCommit = async (committed: Promise<void>) => {
    try {
      await committed;
    } catch (error) {
      setWriteError("A saved change could not be synchronized. Please retry while online.");
      throw error;
    }
  };
  const trackCommit = (committed: Promise<void>) => {
    void awaitCommit(committed).catch(() => undefined);
  };

  const add = async (soda: SodaDocument | Soda, form: SodaForm, details: AvailabilityDetails) => {
    if (user === null) throw new Error("Sign in to contribute.");
    let queued: QueuedWrite<Availability>;
    let catalogSoda: SodaDocument;
    if ("id" in soda) {
      if (state.availability.items.some((item) => item.sodaId === soda.id && item.form === form)) {
        throw new DuplicateAvailabilityError();
      }
      queued = availabilityWriter(locationId, soda, form, details, user);
      catalogSoda = soda;
    } else {
      const newSoda = newSodaAvailabilityWriter(locationId, soda, form, details, user);
      queued = { value: newSoda.value.availability, committed: newSoda.committed };
      catalogSoda = newSoda.value.soda;
    }

    setWriteError(undefined);
    setState((current) =>
      current.status === "ready" &&
      current.location.status === "found" &&
      current.location.value.id === locationId
        ? (() => {
            const items = [...current.availability.items, queued.value];
            const latestUpdatedAt = latestAvailabilityUpdate(items);
            return {
              ...current,
              availability: {
                ...current.availability,
                items,
                ...(latestUpdatedAt === undefined ? {} : { latestUpdatedAt }),
              },
            };
          })()
        : current,
    );
    await awaitCommit(queued.committed);
    return catalogSoda;
  };

  const saveDetails = async (item: Availability, details: AvailabilityDetails) => {
    if (user === null) throw new Error("Sign in to contribute.");
    const queued = availabilityUpdater(item, details, user);
    setWriteError(undefined);
    setState((current) =>
      current.status === "ready"
        ? (() => {
            const items = current.availability.items.map((candidate) =>
              candidate.sodaId === item.sodaId && candidate.form === item.form
                ? queued.value
                : candidate,
            );
            const latestUpdatedAt = latestAvailabilityUpdate(items);
            return {
              ...current,
              availability: {
                ...current.availability,
                items,
                ...(latestUpdatedAt === undefined ? {} : { latestUpdatedAt }),
              },
            };
          })()
        : current,
    );
    await awaitCommit(queued.committed);
  };

  const confirm = () => {
    if (user === null) return;
    const queued = verificationWriter(locationId, user);
    setWriteError(undefined);
    setConfirmationMessage("Availability confirmation saved on this device.");
    setState((current) => {
      if (current.status !== "ready") return current;
      const previous = current.verification.latest;
      return previous === undefined || compareVerifications(queued.value, previous) < 0
        ? { ...current, verification: { ...current.verification, latest: queued.value } }
        : current;
    });
    trackCommit(queued.committed);
  };

  const latestVerification = state.verification.latest;
  const latestUpdate = state.availability.latestUpdatedAt;
  const changedSinceVerification =
    latestUpdate !== undefined &&
    latestVerification !== undefined &&
    latestUpdate > latestVerification.verifiedAt;

  return (
    <Stack spacing={2}>
      <Link href="#/">← Back to browse</Link>
      <Typography variant="h4" component="h2">
        {location.name}
      </Typography>
      <Typography color="text.secondary">{formatAddress(location.address)}</Typography>
      {writeError !== undefined && <Alert severity="error">{writeError}</Alert>}
      <Typography variant="h5" component="h3">
        Availability freshness
      </Typography>
      <Stack spacing={0.5}>
        <Typography>
          Last verified:{" "}
          {latestVerification === undefined
            ? "Never"
            : `${formatLocationUpdatedAt(latestVerification.verifiedAt)} by ${latestVerification.verifiedByName || "Unknown"}`}
        </Typography>
        <Typography>
          Last availability update:{" "}
          {latestUpdate === undefined ? "Unknown" : formatLocationUpdatedAt(latestUpdate)}
        </Typography>
      </Stack>
      {changedSinceVerification && (
        <Alert severity="warning">Availability has changed since it was last verified.</Alert>
      )}
      {state.verification.malformedCount > 0 && (
        <Alert severity="warning">Some malformed verification entries were not shown.</Alert>
      )}
      {confirmationMessage !== undefined && <Alert severity="success">{confirmationMessage}</Alert>}
      {user !== null && (
        <Button variant="outlined" sx={{ alignSelf: "flex-start" }} onClick={confirm}>
          Confirm availability
        </Button>
      )}
      <Typography variant="h5" component="h3">
        Available sodas
      </Typography>
      {state.availability.malformedCount > 0 && (
        <Alert severity="warning">Some malformed availability entries were not shown.</Alert>
      )}
      {state.availability.items.length === 0 ? (
        <Typography color="text.secondary">No sodas listed yet.</Typography>
      ) : (
        <List disablePadding>
          {state.availability.items.map((item, index) => (
            <ListItem key={`${item.sodaId}-${item.form}`} disableGutters sx={{ py: 1 }}>
              <Stack spacing={0.5}>
                <Link href={sodaRoute(item.sodaId)}>{formatSodaAvailability(item)}</Link>
                <AvailabilityDetailsEditor
                  value={{ canSample: item.canSample, canPurchase: item.canPurchase }}
                  idPrefix={`availability-${index}`}
                  {...(user === null ? {} : { onSave: (details) => saveDetails(item, details) })}
                />
              </Stack>
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
          Sign in to edit or confirm soda availability.
        </Alert>
      ) : (
        <AvailabilityForm onAdd={add} loadCatalog={catalogLoader} />
      )}
    </Stack>
  );
}
