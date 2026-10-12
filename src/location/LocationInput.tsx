// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { type FormEvent, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { GeoPoint } from "../model/firestore";
import { geocodeWithTimeout, type Geocoder } from "./geocoder";

/** The `navigator.geolocation` surface this component depends on. */
type GeolocationProvider = Pick<Geolocation, "getCurrentPosition">;

const defaultGeolocation: GeolocationProvider | undefined =
  typeof navigator === "undefined" ? undefined : navigator.geolocation;

export interface LocationInputProps {
  /** Geocoder used for the manual city / postal-code fallback. */
  geocoder: Geocoder;
  /** Called with the resolved coordinate from geolocation or geocoding. */
  onResolve: (geo: GeoPoint) => void;
  /** Called when a manual geocoding attempt fails. */
  onResolveError: () => void;
  /**
   * Geolocation source; defaults to the browser's `navigator.geolocation`.
   * Injectable so tests can supply a fake without touching the real API.
   */
  geolocation?: GeolocationProvider | undefined;
}

/**
 * Lets the user explicitly detect their current position or provide a manual
 * city / postal-code search. Geolocation is never requested during page load,
 * preserving back/forward cache eligibility and avoiding surprise prompts.
 */
export default function LocationInput({
  geocoder,
  onResolve,
  onResolveError,
  geolocation = defaultGeolocation,
}: LocationInputProps) {
  const [locating, setLocating] = useState(false);
  const [info, setInfo] = useState<string | undefined>(
    geolocation === undefined
      ? "Location access isn't available. Enter a city or postal code."
      : undefined,
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  function detectCurrentLocation() {
    if (geolocation === undefined || locating) return;
    const requestId = ++requestIdRef.current;
    setLocating(true);
    setError(undefined);
    setInfo(undefined);
    geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== requestIdRef.current) return;
        setLocating(false);
        setInfo("Using your current location.");
        onResolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (positionError) => {
        if (requestId !== requestIdRef.current) return;
        setLocating(false);
        setInfo(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission denied. Enter a city or postal code."
            : "We couldn't detect your location. Enter a city or postal code.",
        );
      },
    );
  }

  async function resolveQuery() {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }
    const requestId = ++requestIdRef.current;
    setSearching(true);
    setError(undefined);
    try {
      const geo = await geocodeWithTimeout(geocoder, trimmed);
      if (requestId !== requestIdRef.current) return;
      setInfo(`Using the location for "${trimmed}".`);
      onResolve(geo);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      console.error("Location geocoding failed", caught);
      setInfo(undefined);
      setError("Could not geolocate right now.");
      onResolveError();
    } finally {
      if (requestId === requestIdRef.current) setSearching(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void resolveQuery();
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {info !== undefined && <Alert severity="info">{info}</Alert>}
        {error !== undefined && <Alert severity="error">{error}</Alert>}
        {geolocation !== undefined && (
          <Button
            type="button"
            variant="outlined"
            onClick={detectCurrentLocation}
            disabled={locating || searching}
            sx={{ alignSelf: "flex-start" }}
            startIcon={locating ? <CircularProgress size={16} /> : undefined}
          >
            {locating ? "Detecting your location…" : "Use my current location"}
          </Button>
        )}
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          <TextField
            label="City or postal code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            fullWidth
            disabled={searching}
          />
          <Button type="submit" variant="contained" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
