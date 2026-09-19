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
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { app, auth, db } from "./firebase";
import type { GeoPoint } from "./model/firestore";
import AddLocationForm from "./location/AddLocationForm";
import { addLocation, type NewLocationInput } from "./location/addLocation";
import LocationInput from "./location/LocationInput";
import { createGeocoder } from "./location/geocoder";
import { loadLastSearchCenter, saveLastSearchCenter } from "./location/lastSearchCenter";
import NearbySearch from "./nearby/NearbySearch";
import { searchNearby } from "./nearby/nearby";

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
    const [creatingAccount, setCreatingAccount] = useState(initialMode === "signUp");
    const { FirebaseUIProvider, SignInAuthScreen, SignUpAuthScreen } = firebaseUiReact;

    return (
      <FirebaseUIProvider ui={firebaseUi}>
        <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
          <Stack spacing={3}>
            {creatingAccount ? (
              <AuthForm emailAutocomplete="email" passwordAutocomplete="new-password">
                <SignUpAuthScreen
                  onSignUp={onComplete}
                  onSignInClick={() => setCreatingAccount(false)}
                />
              </AuthForm>
            ) : (
              <AuthForm emailAutocomplete="username" passwordAutocomplete="current-password">
                <SignInAuthScreen
                  onSignIn={onComplete}
                  onSignUpClick={() => setCreatingAccount(true)}
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
  const geocoder = useMemo(() => createGeocoder(), []);
  const [location, setLocation] = useState<GeoPoint | undefined>(loadLastSearchCenter);
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState<"signIn" | "signUp">("signIn");
  const pendingLocation = useRef(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [contributionMessage, setContributionMessage] = useState<string>();
  const search = useCallback((center: GeoPoint) => searchNearby(db, center), []);
  const resolveLocation = useCallback((center: GeoPoint) => {
    saveLastSearchCenter(center);
    setLocation(center);
  }, []);
  const clearLocation = useCallback(() => setLocation(undefined), []);
  const closeLogin = useCallback(() => setShowLogin(false), []);
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
    } else {
      setAddingLocation(true);
    }
  }, [user]);
  const saveLocation = useCallback(
    async (input: NewLocationInput) => {
      if (user === null) throw new Error("Authentication is required to add a location");
      await addLocation(db, geocoder, user.uid, input);
    },
    [geocoder, user],
  );
  const handleLocationAdded = useCallback((name: string) => {
    setAddingLocation(false);
    setContributionMessage(`Thanks — ${name} was added.`);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        if (nextUser !== null && pendingLocation.current) {
          pendingLocation.current = false;
          setShowLogin(false);
          setAddingLocation(true);
        }
      }),
    [],
  );

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Simply Fizzed
          </Typography>
          {user === null ? (
            <Button
              color="inherit"
              onClick={() => {
                setLoginMode("signIn");
                setShowLogin(true);
              }}
            >
              Sign in
            </Button>
          ) : (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2">
                {user.displayName ?? user.email ?? "Signed in"}
              </Typography>
              <Button color="inherit" onClick={handleSignOut}>
                Sign out
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

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
          <Stack spacing={2}>
            {contributionMessage !== undefined && (
              <Alert severity="success">{contributionMessage}</Alert>
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
                  <Button variant="outlined" onClick={requestLocationContribution}>
                    Add a location
                  </Button>
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
        </Container>
      )}
    </>
  );
}

export default App;
