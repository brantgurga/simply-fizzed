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
 * Lets the user provide a search location. On mount it requests browser
 * geolocation and, when permitted, resolves immediately with those coordinates.
 * If geolocation is denied or unavailable it falls back to manual city /
 * postal-code entry, geocoded through the injected `Geocoder`. Denied
 * permission and geocoding failures surface as clear messages.
 */
export default function LocationInput({
  geocoder,
  onResolve,
  onResolveError,
  geolocation = defaultGeolocation,
}: LocationInputProps) {
  const [locating, setLocating] = useState(geolocation !== undefined);
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

  useEffect(() => {
    let active = true;
    if (geolocation !== undefined) {
      geolocation.getCurrentPosition(
        (position) => {
          if (!active) return;
          setLocating(false);
          setInfo("Using your current location.");
          onResolve({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        (positionError) => {
          if (!active) return;
          setLocating(false);
          setInfo(
            positionError.code === positionError.PERMISSION_DENIED
              ? "Location permission denied. Enter a city or postal code."
              : "We couldn't detect your location. Enter a city or postal code.",
          );
        },
      );
    }
    return () => {
      active = false;
    };
  }, [geolocation, onResolve]);

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

  if (locating) {
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} aria-label="Detecting your location" />
        <span>Detecting your location…</span>
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {info !== undefined && <Alert severity="info">{info}</Alert>}
        {error !== undefined && <Alert severity="error">{error}</Alert>}
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
