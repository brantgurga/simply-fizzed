// Geocoding is placed behind a small `Geocoder` interface so the app can swap
// implementations by environment: production builds use the Google Maps
// JavaScript API geocoder, while local development, e2e, and unit tests use a fake that
// makes no network calls and therefore incurs no billing. Only the manual
// (city / postal-code) fallback needs geocoding; browser geolocation already
// returns coordinates directly.
import { getToken } from "firebase/app-check";
import { appCheck } from "../firebase";
import type { GeoPoint } from "../model/firestore";

interface GoogleMapsGeocoderResult {
  geometry?: {
    location?: {
      lat?: unknown;
      lng?: unknown;
    };
  };
}

interface GoogleMapsGeocoderClient {
  geocode(
    request: { address: string },
    callback: (results: GoogleMapsGeocoderResult[] | null, status: string) => void,
  ): void;
}

type GoogleMapsGeocoderConstructor = new () => GoogleMapsGeocoderClient;

export type GoogleMapsGeocoderLoader = (apiKey: string) => Promise<GoogleMapsGeocoderConstructor>;

interface GoogleMapsSettings {
  fetchAppCheckToken?: () => Promise<{ token: string }>;
}

interface GoogleMapsSettingsConstructor {
  getInstance(): GoogleMapsSettings;
}

interface GoogleMapsApi {
  maps: {
    importLibrary(name: "core" | "geocoding"): Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: unknown;
    simplyFizzedGoogleMapsLoaded?: () => void;
  }
}

let googleMapsApiPromise: Promise<GoogleMapsApi> | undefined;

function isGoogleMapsApi(value: unknown): value is GoogleMapsApi {
  if (typeof value !== "object" || value === null || !("maps" in value)) return false;
  const { maps } = value;
  if (typeof maps !== "object" || maps === null || !("importLibrary" in maps)) return false;
  return typeof maps.importLibrary === "function";
}

function isGeocoderConstructor(value: unknown): value is GoogleMapsGeocoderConstructor {
  return typeof value === "function";
}

function isSettingsConstructor(value: unknown): value is GoogleMapsSettingsConstructor {
  return (
    typeof value === "function" && "getInstance" in value && typeof value.getInstance === "function"
  );
}

function currentGoogleMapsApi(): GoogleMapsApi | undefined {
  if (typeof window === "undefined") return undefined;
  return isGoogleMapsApi(window.google) ? window.google : undefined;
}

async function loadGoogleMapsGeocoder(apiKey: string): Promise<GoogleMapsGeocoderConstructor> {
  let api = currentGoogleMapsApi();
  if (!api) {
    if (typeof document === "undefined") {
      throw new Error("Google Maps cannot be loaded outside a browser");
    }

    googleMapsApiPromise ??= new Promise<GoogleMapsApi>((resolve, reject) => {
      const url = new URL("https://maps.googleapis.com/maps/api/js");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("loading", "async");
      url.searchParams.set("callback", "simplyFizzedGoogleMapsLoaded");

      const script = document.createElement("script");
      script.async = true;
      script.src = url.toString();
      window.simplyFizzedGoogleMapsLoaded = () => {
        delete window.simplyFizzedGoogleMapsLoaded;
        const loadedApi = currentGoogleMapsApi();
        if (loadedApi) resolve(loadedApi);
        else {
          script.remove();
          reject(new Error("Google Maps loaded without the expected API"));
        }
      };
      script.addEventListener("error", () => {
        delete window.simplyFizzedGoogleMapsLoaded;
        script.remove();
        reject(new Error("Google Maps failed to load"));
      });
      document.head.append(script);
    });

    try {
      api = await googleMapsApiPromise;
    } catch (error) {
      googleMapsApiPromise = undefined;
      throw error;
    }
  }

  const appCheckInstance = appCheck;
  if (appCheckInstance) {
    const coreLibrary = await api.maps.importLibrary("core");
    if (typeof coreLibrary !== "object" || coreLibrary === null || !("Settings" in coreLibrary)) {
      throw new Error("Google Maps loaded without the core settings library");
    }
    const { Settings } = coreLibrary;
    if (!isSettingsConstructor(Settings)) {
      throw new Error("Google Maps loaded an invalid core settings library");
    }
    Settings.getInstance().fetchAppCheckToken = () => getToken(appCheckInstance, false);
  }

  const library = await api.maps.importLibrary("geocoding");
  if (typeof library !== "object" || library === null || !("Geocoder" in library)) {
    throw new Error("Google Maps loaded without the geocoding library");
  }
  const { Geocoder } = library;
  if (!isGeocoderConstructor(Geocoder)) {
    throw new Error("Google Maps loaded an invalid geocoding library");
  }
  return Geocoder;
}

/** Turns a free-form place query (city or postal code) into coordinates. */
export interface Geocoder {
  /**
   * Resolve `query` to a coordinate. Rejects when the query cannot be geocoded
   * or the geocoding request fails.
   */
  geocode(query: string): Promise<GeoPoint>;
}

/** A typed failure from the Google Maps geocoding service. */
export class GeocodingError extends Error {
  readonly status: string;

  constructor(status: string, message = `Google Maps geocoding failed with status ${status}`) {
    super(message);
    this.name = "GeocodingError";
    this.status = status;
  }
}

export const GEOCODING_TIMEOUT_MS = 10_000;

/** Rejects geocoding requests that never settle, such as when the Maps API is unavailable. */
export async function geocodeWithTimeout(
  geocoder: Geocoder,
  query: string,
  timeoutMs = GEOCODING_TIMEOUT_MS,
): Promise<GeoPoint> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new GeocodingError("TIMEOUT", "Geocoding request timed out")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([geocoder.geocode(query), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * `Geocoder` backed by the browser-supported Google Maps JavaScript API. The
 * API key is supplied via `VITE_GOOGLE_MAPS_API_KEY` (see `.env.example`) and
 * passed in by the caller rather than read here.
 */
export class GoogleMapsGeocoder implements Geocoder {
  readonly #apiKey: string;
  readonly #loadGeocoder: GoogleMapsGeocoderLoader;

  constructor(apiKey: string, loadGeocoder: GoogleMapsGeocoderLoader = loadGoogleMapsGeocoder) {
    this.#apiKey = apiKey;
    this.#loadGeocoder = loadGeocoder;
  }

  async geocode(query: string): Promise<GeoPoint> {
    const Geocoder = await this.#loadGeocoder(this.#apiKey);
    const geocoder = new Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status !== "OK") {
          reject(new GeocodingError(status));
          return;
        }

        const location = results?.[0]?.geometry?.location;
        if (typeof location?.lat !== "function" || typeof location.lng !== "function") {
          reject(new GeocodingError("INVALID_RESPONSE"));
          return;
        }

        try {
          const lat: unknown = location.lat();
          const lng: unknown = location.lng();
          if (typeof lat !== "number" || typeof lng !== "number") {
            reject(new GeocodingError("INVALID_RESPONSE"));
            return;
          }
          resolve({ lat, lng });
        } catch {
          reject(new GeocodingError("INVALID_RESPONSE"));
        }
      });
    });
  }
}

/**
 * Offline `Geocoder` for development and tests. It resolves queries against a
 * caller-supplied lookup table (keyed by a normalized, lowercased query) and,
 * when provided, a `fallback` coordinate for any unknown query. Without a
 * fallback, unknown queries reject so failure handling can be exercised.
 */
export class FakeGeocoder implements Geocoder {
  readonly #results: Record<string, GeoPoint>;
  readonly #fallback: GeoPoint | undefined;

  constructor(results: Record<string, GeoPoint> = {}, fallback?: GeoPoint) {
    this.#results = results;
    this.#fallback = fallback;
  }

  geocode(query: string): Promise<GeoPoint> {
    const hit = this.#results[query.trim().toLowerCase()];
    if (hit) {
      return Promise.resolve(hit);
    }
    if (this.#fallback) {
      return Promise.resolve(this.#fallback);
    }
    return Promise.reject(new GeocodingError("ZERO_RESULTS", `No geocoding result for "${query}"`));
  }
}

/**
 * Choose a `Geocoder` for the current environment. A `demo-` prefixed
 * `VITE_GOOGLE_MAPS_API_KEY` marks the committed demo configuration (local dev
 * and e2e), which uses the offline `FakeGeocoder` with a stable fallback so the
 * manual flow works without a real key or billing. Any other key is treated as
 * a real one and routed to `GoogleMapsGeocoder`. This mirrors the `demo-`
 * convention used for Firebase in `src/firebase.ts`.
 */
export function createGeocoder(
  apiKey: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
): Geocoder {
  if (apiKey.startsWith("demo-")) {
    // Kansas City, MO — an arbitrary but stable stand-in for demo/dev use.
    return new FakeGeocoder({}, { lat: 39.0997, lng: -94.5786 });
  }
  return new GoogleMapsGeocoder(apiKey);
}
