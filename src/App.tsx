import { useCallback, useMemo, useState } from "react";
import AppBar from "@mui/material/AppBar";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { db } from "./firebase";
import type { GeoPoint } from "./model/firestore";
import LocationInput from "./location/LocationInput";
import { createGeocoder } from "./location/geocoder";
import NearbySearch from "./nearby/NearbySearch";
import { searchNearby } from "./nearby/nearby";

function App() {
  const geocoder = useMemo(() => createGeocoder(), []);
  const [location, setLocation] = useState<GeoPoint | undefined>(undefined);
  const search = useCallback((center: GeoPoint) => searchNearby(db, center), []);

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
        <Stack spacing={2}>
          <Typography variant="body1" color="text.secondary">
            Find soda near you. Set your location to start searching.
          </Typography>

          <LocationInput geocoder={geocoder} onResolve={setLocation} />

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
    </>
  );
}

export default App;
