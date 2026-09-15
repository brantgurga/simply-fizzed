// Geocoding is placed behind a small `Geocoder` interface so the app can swap
// implementations by environment: production builds use the real Google Maps
// Geocoding API, while local development, e2e, and unit tests use a fake that
// makes no network calls and therefore incurs no billing. Only the manual
// (city / postal-code) fallback needs geocoding; browser geolocation already
// returns coordinates directly.
import type { GeoPoint } from "../model/firestore";

/** Turns a free-form place query (city or postal code) into coordinates. */
export interface Geocoder {
  /**
   * Resolve `query` to a coordinate. Rejects when the query cannot be geocoded
   * or the geocoding request fails.
   */
  geocode(query: string): Promise<GeoPoint>;
}

/**
 * Extract a coordinate from a Google Geocoding API response, validating the
 * untyped JSON at runtime so a malformed or error response yields `undefined`
 * rather than an unsafe cast.
 */
function coordinateFromResponse(data: unknown): GeoPoint | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  if (!("status" in data) || data.status !== "OK") return undefined;
  if (!("results" in data) || !Array.isArray(data.results)) return undefined;

  const first: unknown = data.results[0];
  if (typeof first !== "object" || first === null || !("geometry" in first)) return undefined;
  const { geometry } = first;
  if (typeof geometry !== "object" || geometry === null || !("location" in geometry)) {
    return undefined;
  }
  const { location } = geometry;
  if (typeof location !== "object" || location === null) return undefined;
  if (!("lat" in location) || !("lng" in location)) return undefined;

  const { lat, lng } = location;
  if (typeof lat !== "number" || typeof lng !== "number") return undefined;
  return { lat, lng };
}

/**
 * `Geocoder` backed by the Google Maps Geocoding web service. The API key is
 * supplied via `VITE_GOOGLE_MAPS_API_KEY` (see `.env.example`) and passed in by
 * the caller rather than read here, keeping this class free of environment
 * coupling and easy to test.
 */
export class GoogleMapsGeocoder implements Geocoder {
  readonly #apiKey: string;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  async geocode(query: string): Promise<GeoPoint> {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", this.#apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding request failed with status ${response.status}`);
    }

    const point = coordinateFromResponse(await response.json());
    if (!point) {
      throw new Error(`No geocoding result for "${query}"`);
    }
    return point;
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
    return Promise.reject(new Error(`No geocoding result for "${query}"`));
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
