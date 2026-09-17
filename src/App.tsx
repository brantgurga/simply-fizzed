import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { app, auth, db } from "./firebase";
import type { GeoPoint } from "./model/firestore";
import LocationInput from "./location/LocationInput";
import { createGeocoder } from "./location/geocoder";
import { loadLastSearchCenter, saveLastSearchCenter } from "./location/lastSearchCenter";
import NearbySearch from "./nearby/NearbySearch";
import { searchNearby } from "./nearby/nearby";

type LoginScreenProps = {
  onCancel: () => void;
  onComplete: () => void;
};

const LoginScreen = lazy(async () => {
  const [firebaseUiCore, firebaseUiReact] = await Promise.all([
    import("@firebase-oss/ui-core"),
    import("@firebase-oss/ui-react"),
    import("@firebase-oss/ui-styles/dist.min.css"),
  ]);
  const firebaseUi = firebaseUiCore.initializeUI({ app, auth });

  function FirebaseLoginScreen({ onCancel, onComplete }: LoginScreenProps) {
    const [creatingAccount, setCreatingAccount] = useState(false);
    const { FirebaseUIProvider, SignInAuthScreen, SignUpAuthScreen } = firebaseUiReact;

    return (
      <FirebaseUIProvider ui={firebaseUi}>
        <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
          <Stack spacing={3}>
            {creatingAccount ? (
              <SignUpAuthScreen
                onSignUp={onComplete}
                onSignInClick={() => setCreatingAccount(false)}
              />
            ) : (
              <SignInAuthScreen
                onSignIn={onComplete}
                onSignUpClick={() => setCreatingAccount(true)}
              />
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
  const search = useCallback((center: GeoPoint) => searchNearby(db, center), []);
  const resolveLocation = useCallback((center: GeoPoint) => {
    saveLastSearchCenter(center);
    setLocation(center);
  }, []);
  const closeLogin = useCallback(() => setShowLogin(false), []);
  const handleSignOut = useCallback(() => {
    void signOut(auth);
  }, []);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Simply Fizzed
          </Typography>
          {user === null ? (
            <Button color="inherit" onClick={() => setShowLogin(true)}>
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
          <LoginScreen onCancel={closeLogin} onComplete={closeLogin} />
        </Suspense>
      ) : (
        <Container component="main" maxWidth="md" sx={{ py: 4 }}>
          <Stack spacing={2}>
            <Typography variant="body1" color="text.secondary">
              Find soda near you. Set your location to start searching.
            </Typography>

            <LocationInput geocoder={geocoder} onResolve={resolveLocation} />

            {location !== undefined && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Searching near {location.lat.toFixed(4)}, {location.lng.toFixed(4)}.
                </Typography>
                <NearbySearch center={location} search={search} />
              </>
            )}
          </Stack>
        </Container>
      )}
    </>
  );
}

export default App;
