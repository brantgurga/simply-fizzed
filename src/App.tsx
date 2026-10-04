import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { communityWriteErrorMessage, useAuthorization } from "./authorization";
import { publicContributorName } from "./contributor";
import { app, auth, db, isFirestoreAvailable } from "./firebase";
import type { GeoPoint } from "./model/firestore";
import AddLocationForm, { ISSUE_REPORT_URL } from "./location/AddLocationForm";
import { addLocation, type NewLocationInput } from "./location/addLocation";
import LocationDetail from "./location/LocationDetail";
import LocationInput from "./location/LocationInput";
import { createGeocoder } from "./location/geocoder";
import { loadLastSearchCenter, saveLastSearchCenter } from "./location/lastSearchCenter";
import UserManagement from "./management/UserManagement";
import NearbySearch from "./nearby/NearbySearch";
import { searchNearby } from "./nearby/nearby";
import UserProfile from "./profile/UserProfile";
import { manageUsersRoute, profileRoute, useHashRoute } from "./routes";
import { savePublicProfile } from "./rating/ratings";
import SodaDetail from "./soda/SodaDetail";

type LoginScreenProps = {
  initialMode: "signIn" | "signUp";
  onCancel: () => void;
  onComplete: () => void;
};

type AuthFormProps = {
  children: ReactNode;
  emailAutocomplete: "email" | "username";
  passwordAutocomplete: "current-password" | "new-password";
};

function AuthForm({ children, emailAutocomplete, passwordAutocomplete }: AuthFormProps) {
  const container = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    container.current
      ?.querySelector<HTMLInputElement>('input[type="email"]')
      ?.setAttribute("autocomplete", emailAutocomplete);
    container.current
      ?.querySelector<HTMLInputElement>('input[type="password"]')
      ?.setAttribute("autocomplete", passwordAutocomplete);
  }, [emailAutocomplete, passwordAutocomplete]);

  return (
    <Box ref={container} sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
      {children}
    </Box>
  );
}

const LoginScreen = lazy(async () => {
  const [firebaseUiCore, firebaseUiReact] = await Promise.all([
    import("@firebase-oss/ui-core"),
    import("@firebase-oss/ui-react"),
    import("@firebase-oss/ui-styles/dist.min.css"),
  ]);
  const firebaseUi = firebaseUiCore.initializeUI({ app, auth });

  function FirebaseLoginScreen({ initialMode, onCancel, onComplete }: LoginScreenProps) {
    const [mode, setMode] = useState<"signIn" | "signUp" | "forgotPassword">(initialMode);
    const { FirebaseUIProvider, ForgotPasswordAuthScreen, SignInAuthScreen, SignUpAuthScreen } =
      firebaseUiReact;

    return (
      <FirebaseUIProvider ui={firebaseUi}>
        <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
          <Stack spacing={3}>
            {mode === "signUp" ? (
              <AuthForm emailAutocomplete="email" passwordAutocomplete="new-password">
                <SignUpAuthScreen onSignUp={onComplete} onSignInClick={() => setMode("signIn")} />
              </AuthForm>
            ) : mode === "forgotPassword" ? (
              <AuthForm emailAutocomplete="email" passwordAutocomplete="current-password">
                <ForgotPasswordAuthScreen onBackToSignInClick={() => setMode("signIn")} />
              </AuthForm>
            ) : (
              <AuthForm emailAutocomplete="username" passwordAutocomplete="current-password">
                <SignInAuthScreen
                  onSignIn={onComplete}
                  onForgotPasswordClick={() => setMode("forgotPassword")}
                  onSignUpClick={() => setMode("signUp")}
                />
              </AuthForm>
            )}

            <Button onClick={onCancel}>Back to browsing</Button>
          </Stack>
        </Container>
      </FirebaseUIProvider>
    );
  }

  return { default: FirebaseLoginScreen };
});

function App() {
  const route = useHashRoute();
  const geocoder = useMemo(() => createGeocoder(), []);
  const [location, setLocation] = useState<GeoPoint | undefined>(loadLastSearchCenter);
  const [user, setUser] = useState<User | null>(null);
  const {
    authorization,
    loading: authorizationLoading,
    refresh: refreshAuthorization,
  } = useAuthorization(user);
  const communityWritable = authorization?.canWriteCommunity === true;
  const restricted = authorization?.restricted === true;
  const [profileReady, setProfileReady] = useState(false);
  const [firestoreUnavailable, setFirestoreUnavailable] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<"signIn" | "signUp">("signIn");
  const pendingLocation = useRef(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [contributionMessage, setContributionMessage] = useState<{
    severity: "error" | "success";
    text: string;
  }>();
  const search = useCallback((center: GeoPoint) => searchNearby(db, center), []);
  const resolveLocation = useCallback((center: GeoPoint) => {
    saveLastSearchCenter(center);
    setLocation(center);
  }, []);
  const clearLocation = useCallback(() => setLocation(undefined), []);
  const closeLogin = useCallback(() => setShowLogin(false), []);
  const requestSignIn = useCallback(() => {
    setLoginMode("signIn");
    setShowLogin(true);
  }, []);
  const cancelLogin = useCallback(() => {
    setShowLogin(false);
    pendingLocation.current = false;
  }, []);
  const handleSignOut = useCallback(() => {
    setAddingLocation(false);
    void signOut(auth);
  }, []);
  const requestLocationContribution = useCallback(() => {
    setContributionMessage(undefined);
    if (user === null) {
      setLoginMode("signUp");
      pendingLocation.current = true;
      setShowLogin(true);
    } else if (communityWritable) {
      setAddingLocation(true);
    } else {
      setContributionMessage({
        severity: "error",
        text: "Community contribution access is unavailable until current permission is confirmed.",
      });
    }
  }, [communityWritable, user]);
  const saveLocation = useCallback(
    async (input: NewLocationInput) => {
      if (user === null) throw new Error("Authentication is required to add a location");
      if (!communityWritable) throw new Error("Community contribution access is unavailable.");
      const contributorName = publicContributorName(user);
      try {
        await addLocation(
          db,
          geocoder,
          { id: user.uid, ...(contributorName === undefined ? {} : { name: contributorName }) },
          input,
        );
      } catch (error) {
        const message = communityWriteErrorMessage(error, restricted);
        const code =
          typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code.endsWith("permission-denied")) {
          setContributionMessage({ severity: "error", text: message });
          void refreshAuthorization();
        }
        throw error;
      }
    },
    [communityWritable, geocoder, refreshAuthorization, restricted, user],
  );
  const handleLocationAdded = useCallback((name: string) => {
    setAddingLocation(false);
    setContributionMessage({ severity: "success", text: `Thanks — ${name} was added.` });
  }, []);

  useEffect(() => {
    let active = true;
    let request = 0;
    const checkAvailability = () => {
      const currentRequest = ++request;
      void isFirestoreAvailable(db).then((available) => {
        if (active && request === currentRequest) setFirestoreUnavailable(!available);
      });
    };
    const useOfflineCache = () => {
      request += 1;
      setFirestoreUnavailable(false);
    };

    checkAvailability();
    window.addEventListener("online", checkAvailability);
    window.addEventListener("offline", useOfflineCache);
    return () => {
      active = false;
      window.removeEventListener("online", checkAvailability);
      window.removeEventListener("offline", useOfflineCache);
    };
  }, []);

  useEffect(() => {
    let profileRequest = 0;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      const currentRequest = ++profileRequest;
      setUser(nextUser);
      setProfileReady(false);
      if (nextUser !== null) {
        void savePublicProfile(db, nextUser.uid, publicContributorName(nextUser) ?? "")
          .then(() => {
            if (profileRequest === currentRequest) setProfileReady(true);
          })
          .catch(() => undefined);
      }
      if (nextUser !== null && pendingLocation.current) setShowLogin(false);
    });
    return () => {
      profileRequest += 1;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user === null || !pendingLocation.current || authorization === null) return;
    pendingLocation.current = false;
    // Continue the user-requested contribution only after server authority resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    if (authorization.canWriteCommunity) setAddingLocation(true);
    else {
      setContributionMessage({
        severity: "error",
        text: "Community contribution access is unavailable until current permission is confirmed.",
      });
    }
  }, [authorization, user]);

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            <Link href="#/" color="inherit" underline="none">
              Simply Fizzed
            </Link>
          </Typography>
          {user === null ? (
            <Button color="inherit" onClick={requestSignIn}>
              Sign in
            </Button>
          ) : (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {profileReady ? (
                <Link href={profileRoute(user.uid)} color="inherit" variant="body2">
                  {user.displayName ?? user.email ?? "Signed in"}
                </Link>
              ) : (
                <Typography variant="body2">
                  {user.displayName ?? user.email ?? "Signed in"}
                </Typography>
              )}
              {authorization?.canManageUsers === true && (
                <Link href={manageUsersRoute} color="inherit" variant="body2">
                  Manage users
                </Link>
              )}
              <Button color="inherit" onClick={handleSignOut}>
                Sign out
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      {firestoreUnavailable && (
        <Container maxWidth="md" sx={{ pt: 4 }}>
          <Alert severity="error">
            Something went wrong. Soda data is currently unavailable. Please try again later. If the
            problem persists, <Link href={ISSUE_REPORT_URL}>report it</Link>.
          </Alert>
        </Container>
      )}

      {showLogin && user === null ? (
        <Suspense
          fallback={
            <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
              <Typography>Loading sign-in…</Typography>
            </Container>
          }
        >
          <LoginScreen initialMode={loginMode} onCancel={cancelLogin} onComplete={closeLogin} />
        </Suspense>
      ) : (
        <Container component="main" maxWidth="md" sx={{ py: 4 }}>
          {authorization?.restricted === true && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Community contributions are restricted
              {authorization.restriction?.publicReason
                ? `: ${authorization.restriction.publicReason}`
                : "."}
              {authorization.restriction !== null && (
                <Typography component="span" variant="caption" sx={{ display: "block", mt: 0.5 }}>
                  Originally restricted by {authorization.restriction.originallyRestrictedBy} at{" "}
                  {new Date(authorization.restriction.originallyRestrictedAt).toLocaleString()}.
                  Last updated by {authorization.restriction.restrictionLastUpdatedBy} at{" "}
                  {new Date(authorization.restriction.restrictionLastUpdatedAt).toLocaleString()}.
                  {authorization.restriction.expiresAt === null
                    ? " No expiration."
                    : ` Expires ${new Date(authorization.restriction.expiresAt).toLocaleString()}.`}
                </Typography>
              )}
            </Alert>
          )}
          {route.page === "location" ? (
            <LocationDetail
              locationId={route.id}
              user={user}
              onSignIn={requestSignIn}
              canContribute={communityWritable}
              restricted={restricted}
              onCommunityWriteRejected={() => void refreshAuthorization()}
            />
          ) : route.page === "soda" ? (
            <SodaDetail sodaId={route.id} user={user} onSignIn={requestSignIn} />
          ) : route.page === "profile" ? (
            <UserProfile userId={route.id} />
          ) : route.page === "manageUsers" ? (
            authorization?.canManageUsers === true ? (
              <UserManagement authorization={authorization} />
            ) : authorizationLoading && user !== null ? (
              <Typography>Confirming user-management access…</Typography>
            ) : (
              <Alert severity="warning">Current user-management authority is required.</Alert>
            )
          ) : route.page === "notFound" ? (
            <Stack spacing={2}>
              <Alert severity="warning">This page could not be found.</Alert>
              <Link href="#/">Back to browse</Link>
            </Stack>
          ) : (
            <Stack spacing={2}>
              {contributionMessage !== undefined && (
                <Alert severity={contributionMessage.severity}>{contributionMessage.text}</Alert>
              )}

              {addingLocation && user !== null ? (
                <>
                  <Typography variant="h4" component="h2">
                    Add a soda location
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    Share a place where other fans can find soda.
                  </Typography>
                  <AddLocationForm
                    onSave={saveLocation}
                    onAdded={handleLocationAdded}
                    onCancel={() => setAddingLocation(false)}
                  />
                </>
              ) : (
                <>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
                  >
                    <Typography variant="body1" color="text.secondary">
                      Find soda near you. Set your location to start searching.
                    </Typography>
                    {(user === null || communityWritable) && (
                      <Button variant="outlined" onClick={requestLocationContribution}>
                        Add a location
                      </Button>
                    )}
                  </Stack>

                  <LocationInput
                    geocoder={geocoder}
                    onResolve={resolveLocation}
                    onResolveError={clearLocation}
                  />

                  {location !== undefined && (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Searching near {location.lat.toFixed(4)}, {location.lng.toFixed(4)}.
                      </Typography>
                      <NearbySearch center={location} search={search} />
                    </>
                  )}
                </>
              )}
            </Stack>
          )}
        </Container>
      )}
    </>
  );
}

export default App;
