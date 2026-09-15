import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GeoPoint } from "../model/firestore";
import { SEARCH_RADIUS_MILES } from "./distance";
import type { NearbyLocation } from "./results";
import SearchResults from "./SearchResults";

/** Runs a nearby search for a center coordinate. Injected for testability. */
export type NearbySearcher = (center: GeoPoint) => Promise<NearbyLocation[]>;

interface NearbySearchProps {
  center: GeoPoint;
  search: NearbySearcher;
}

/**
 * Container that runs a nearby search whenever the `center` changes and renders
 * its loading, error, empty, and results states. The actual query is injected
 * via `search`, keeping this component free of Firestore for testing.
 */
export default function NearbySearch({ center, search }: NearbySearchProps) {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [results, setResults] = useState<NearbyLocation[]>([]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    search(center)
      .then((found) => {
        if (active) {
          setResults(found);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [center, search]);

  if (status === "loading") {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <span>Searching for soda near you…</span>
      </Stack>
    );
  }

  if (status === "error") {
    return <Alert severity="error">Something went wrong while searching. Please try again.</Alert>;
  }

  if (results.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No soda found within {SEARCH_RADIUS_MILES} miles.
      </Typography>
    );
  }

  return <SearchResults results={results} />;
}
