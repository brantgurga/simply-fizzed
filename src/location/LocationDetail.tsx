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
import { communityWriteErrorMessage } from "../authorization";
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
  canContribute?: boolean;
  restricted?: boolean;
  onCommunityWriteRejected?: () => void;
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
/** Loads the latest location verification from the application's Firestore instance. */
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

/** Queues an attributed detail edit for the signed-in contributor. */
const defaultAvailabilityUpdater = (
  availability: Availability,
  details: AvailabilityDetails,
  user: ContributionUser,
) => updateAvailabilityDetails(db, availability, details, contributorFor(user));

/** Queues an append-only verification for the signed-in contributor. */
const defaultVerificationWriter = (locationId: string, user: ContributionUser) =>
  confirmLocationAvailability(db, locationId, contributorFor(user));

/** Replaces loaded availability and recomputes its latest known action time. */
function withAvailabilityItems(
  availability: AvailabilityLoad,
  items: Availability[],
): AvailabilityLoad {
  const latestUpdatedAt = latestAvailabilityUpdate(items);
  return {
    items,
    malformedCount: availability.malformedCount,
    ...(latestUpdatedAt === undefined ? {} : { latestUpdatedAt }),
  };
}

export default function LocationDetail({
  locationId,
  user,
  onSignIn,
  canContribute = user !== null,
  restricted = false,
  onCommunityWriteRejected,
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
  const [writeError, setWriteError] = useState<{ locationId: string; message: string }>();
  const [confirmationMessage, setConfirmationMessage] = useState<{
    locationId: string;
    message: string;
  }>();
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
  const commitLocationId = locationId;
  const communityWritable = user !== null && canContribute;
  /** Records a location-scoped synchronization error and rethrows a rejected commit. */
  const awaitCommit = async (committed: Promise<void>) => {
    try {
      await committed;
    } catch (error) {
      setWriteError({
        locationId: commitLocationId,
        message: communityWriteErrorMessage(error, restricted),
      });
      const code =
        typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code.endsWith("permission-denied")) onCommunityWriteRejected?.();
      throw error;
    }
  };
  /** Observes a background commit and runs rollback behavior if synchronization fails. */
  const trackCommit = (committed: Promise<void>, onRejected: () => void) => {
    void awaitCommit(committed).catch(onRejected);
  };

  const add = async (soda: SodaDocument | Soda, form: SodaForm, details: AvailabilityDetails) => {
    if (!communityWritable || user === null) {
      throw new Error("Community contribution access is unavailable.");
    }
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
        ? {
            ...current,
            availability: withAvailabilityItems(current.availability, [
              ...current.availability.items,
              queued.value,
            ]),
          }
        : current,
    );
    try {
      await awaitCommit(queued.committed);
      return catalogSoda;
    } catch (error) {
      setState((current) => {
        if (current.status !== "ready" || !current.availability.items.includes(queued.value)) {
          return current;
        }
        return {
          ...current,
          availability: withAvailabilityItems(
            current.availability,
            current.availability.items.filter((candidate) => candidate !== queued.value),
          ),
        };
      });
      throw error;
    }
  };

  /** Optimistically saves details, rolling back only this edit when synchronization fails. */
  const saveDetails = async (item: Availability, details: AvailabilityDetails) => {
    if (!communityWritable || user === null) {
      throw new Error("Community contribution access is unavailable.");
    }
    const queued = availabilityUpdater(item, details, user);
    setWriteError(undefined);
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            availability: withAvailabilityItems(
              current.availability,
              current.availability.items.map((candidate) =>
                candidate.sodaId === item.sodaId && candidate.form === item.form
                  ? queued.value
                  : candidate,
              ),
            ),
          }
        : current,
    );
    try {
      await awaitCommit(queued.committed);
    } catch (error) {
      setState((current) => {
        if (current.status !== "ready" || !current.availability.items.includes(queued.value)) {
          return current;
        }
        return {
          ...current,
          availability: withAvailabilityItems(
            current.availability,
            current.availability.items.map((candidate) =>
              candidate === queued.value ? item : candidate,
            ),
          ),
        };
      });
      throw error;
    }
  };

  /** Queues an explicit confirmation and restores prior freshness state if it is rejected. */
  const confirm = () => {
    if (!communityWritable || user === null) return;
    const queued = verificationWriter(locationId, user);
    const previous = state.verification.latest;
    setWriteError(undefined);
    setConfirmationMessage({
      locationId,
      message: "Availability confirmation saved on this device.",
    });
    setState((current) => {
      if (current.status !== "ready") return current;
      const latest = current.verification.latest;
      return latest === undefined || compareVerifications(queued.value, latest) < 0
        ? { ...current, verification: { ...current.verification, latest: queued.value } }
        : current;
    });
    trackCommit(queued.committed, () => {
      setState((current) => {
        if (current.status !== "ready" || current.verification.latest !== queued.value) {
          return current;
        }
        return {
          ...current,
          verification: {
            malformedCount: current.verification.malformedCount,
            ...(previous === undefined ? {} : { latest: previous }),
          },
        };
      });
      setConfirmationMessage((current) =>
        current?.locationId === commitLocationId ? undefined : current,
      );
    });
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
      {writeError?.locationId === locationId && (
        <Alert severity="error">{writeError.message}</Alert>
      )}
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
      {confirmationMessage?.locationId === locationId && (
        <Alert severity="success">{confirmationMessage.message}</Alert>
      )}
      {communityWritable && (
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
                  {...(!communityWritable
                    ? {}
                    : { onSave: (details) => saveDetails(item, details) })}
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
      ) : !communityWritable ? (
        <Alert severity="warning">
          Community contribution controls are unavailable until current permission is confirmed.
        </Alert>
      ) : (
        <AvailabilityForm onAdd={add} loadCatalog={catalogLoader} />
      )}
    </Stack>
  );
}
