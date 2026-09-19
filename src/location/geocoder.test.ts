import { describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  appCheck: { name: "test-app-check" },
  getToken: vi.fn(async () => ({ token: "test-app-check-token" })),
}));

vi.mock("../firebase", () => ({ appCheck: firebase.appCheck }));
vi.mock("firebase/app-check", () => ({ getToken: firebase.getToken }));

import {
  createGeocoder,
  FakeGeocoder,
  GeocodingError,
  GoogleMapsGeocoder,
  type GoogleMapsGeocoderLoader,
} from "./geocoder";

type GeocodeCallback = (
  results: Array<{
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
  }> | null,
  status: string,
) => void;

const itInBrowser = typeof document === "undefined" ? it.skip : it;

describe("FakeGeocoder", () => {
  it("resolves known queries case-insensitively and trimmed", async () => {
    const geocoder = new FakeGeocoder({ "kansas city": { lat: 39.1, lng: -94.6 } });

    await expect(geocoder.geocode("  Kansas City ")).resolves.toEqual({ lat: 39.1, lng: -94.6 });
  });

  it("uses the fallback for unknown queries when provided", async () => {
    const geocoder = new FakeGeocoder({}, { lat: 1, lng: 2 });

    await expect(geocoder.geocode("nowhere")).resolves.toEqual({ lat: 1, lng: 2 });
  });

  it("rejects unknown queries without a fallback", async () => {
    const geocoder = new FakeGeocoder();

    await expect(geocoder.geocode("nowhere")).rejects.toThrow();
  });
});

describe("GoogleMapsGeocoder", () => {
  it("returns coordinates and sends the address and key", async () => {
    let requestedAddress: string | undefined;
    const loader = vi.fn<GoogleMapsGeocoderLoader>(
      async () =>
        class {
          geocode(request: { address: string }, callback: GeocodeCallback) {
            requestedAddress = request.address;
            callback([{ geometry: { location: { lat: () => 39.1, lng: () => -94.6 } } }], "OK");
          }
        },
    );
    const geocoder = new GoogleMapsGeocoder("browser-key", loader);

    await expect(geocoder.geocode("Kansas City")).resolves.toEqual({ lat: 39.1, lng: -94.6 });
    expect(loader).toHaveBeenCalledWith("browser-key");
    expect(requestedAddress).toBe("Kansas City");
  });

  it.each(["ZERO_RESULTS", "REQUEST_DENIED", "OVER_QUERY_LIMIT"])(
    "preserves the %s status when geocoding fails",
    async (status) => {
      const loader: GoogleMapsGeocoderLoader = async () =>
        class {
          geocode(_request: { address: string }, callback: GeocodeCallback) {
            callback([], status);
          }
        };
      const geocoder = new GoogleMapsGeocoder("browser-key", loader);

      await expect(geocoder.geocode("Indianapolis, IN")).rejects.toEqual(
        new GeocodingError(status),
      );
    },
  );

  it("rejects a malformed successful response", async () => {
    const loader: GoogleMapsGeocoderLoader = async () =>
      class {
        geocode(_request: { address: string }, callback: GeocodeCallback) {
          callback([], "OK");
        }
      };
    const geocoder = new GoogleMapsGeocoder("browser-key", loader);

    await expect(geocoder.geocode("Indianapolis, IN")).rejects.toEqual(
      new GeocodingError("INVALID_RESPONSE"),
    );
  });

  it("rejects when a malformed coordinate accessor throws", async () => {
    const loader: GoogleMapsGeocoderLoader = async () =>
      class {
        geocode(_request: { address: string }, callback: GeocodeCallback) {
          callback(
            [
              {
                geometry: {
                  location: {
                    lat: () => {
                      throw new Error("malformed coordinate");
                    },
                    lng: () => -86.1581,
                  },
                },
              },
            ],
            "OK",
          );
        }
      };
    const geocoder = new GoogleMapsGeocoder("browser-key", loader);

    await expect(geocoder.geocode("Indianapolis, IN")).rejects.toEqual(
      new GeocodingError("INVALID_RESPONSE"),
    );
  });

  itInBrowser("loads Maps geocoding with the shared App Check token provider", async () => {
    const settings: {
      fetchAppCheckToken?: () => Promise<{ token: string }>;
    } = {};
    const Settings = Object.assign(() => undefined, {
      getInstance: () => settings,
    });
    const importLibrary = vi.fn(async (name: "core" | "geocoding") => {
      if (name === "core") return { Settings };
      return {
        Geocoder: class {
          geocode(_request: { address: string }, callback: GeocodeCallback) {
            callback(
              [{ geometry: { location: { lat: () => 39.7684, lng: () => -86.1581 } } }],
              "OK",
            );
          }
        },
      };
    });
    const append = vi.spyOn(document.head, "append").mockImplementation((node) => {
      if (!(node instanceof HTMLScriptElement)) throw new Error("Expected a script element");
      const url = new URL(node.src);
      expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/js");
      expect(url.searchParams.get("key")).toBe("browser-key");
      expect(url.searchParams.get("callback")).toBe("simplyFizzedGoogleMapsLoaded");
      window.google = { maps: { importLibrary } };
      queueMicrotask(() => window.simplyFizzedGoogleMapsLoaded?.());
    });

    try {
      const geocoder = new GoogleMapsGeocoder("browser-key");
      await expect(geocoder.geocode("Indianapolis, IN")).resolves.toEqual({
        lat: 39.7684,
        lng: -86.1581,
      });
      expect(importLibrary.mock.calls.map(([name]) => name)).toEqual(["core", "geocoding"]);
      await expect(settings.fetchAppCheckToken?.()).resolves.toEqual({
        token: "test-app-check-token",
      });
      expect(firebase.getToken).toHaveBeenCalledWith(firebase.appCheck, false);
    } finally {
      append.mockRestore();
      delete window.google;
      delete window.simplyFizzedGoogleMapsLoaded;
    }
  });
});

describe("createGeocoder", () => {
  it("uses the offline fake for a demo key", async () => {
    const geocoder = createGeocoder("demo-google-maps-api-key");

    expect(geocoder).toBeInstanceOf(FakeGeocoder);
    await expect(geocoder.geocode("anything")).resolves.toEqual({ lat: 39.0997, lng: -94.5786 });
  });

  it("uses the Google geocoder for a real key", () => {
    expect(createGeocoder("real-key")).toBeInstanceOf(GoogleMapsGeocoder);
  });
});
