import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeocoder, FakeGeocoder, GoogleMapsGeocoder } from "./geocoder";

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns coordinates and sends the address and key", async () => {
    let requested: URL | undefined;
    const fetchMock = vi.fn((input: URL) => {
      requested = input;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            status: "OK",
            results: [{ geometry: { location: { lat: 39.1, lng: -94.6 } } }],
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const geocoder = new GoogleMapsGeocoder("secret-key");

    await expect(geocoder.geocode("Kansas City")).resolves.toEqual({ lat: 39.1, lng: -94.6 });
    expect(requested?.searchParams.get("address")).toBe("Kansas City");
    expect(requested?.searchParams.get("key")).toBe("secret-key");
  });

  it("throws when the request is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })),
    );

    const geocoder = new GoogleMapsGeocoder("secret-key");

    await expect(geocoder.geocode("Kansas City")).rejects.toThrow();
  });

  it("throws when the response has no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ZERO_RESULTS", results: [] }),
        }),
      ),
    );

    const geocoder = new GoogleMapsGeocoder("secret-key");

    await expect(geocoder.geocode("nowhere")).rejects.toThrow();
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
