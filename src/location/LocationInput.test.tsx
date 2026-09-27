import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeGeocoder, GeocodingError, type Geocoder } from "./geocoder";
import LocationInput from "./LocationInput";

type GeolocationProvider = Pick<Geolocation, "getCurrentPosition">;

function positionAt(latitude: number, longitude: number): GeolocationPosition {
  const coords: GeolocationCoordinates = {
    accuracy: 0,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    latitude,
    longitude,
    speed: null,
    toJSON: () => ({}),
  };
  return { coords, timestamp: Date.now(), toJSON: () => ({}) };
}

describe("LocationInput", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the manual form when geolocation is unavailable", () => {
    render(
      <LocationInput
        geocoder={new FakeGeocoder()}
        onResolve={vi.fn()}
        onResolveError={vi.fn()}
        geolocation={undefined}
      />,
    );

    expect(screen.getByText(/location access isn't available/i)).toBeInTheDocument();
    expect(screen.getByLabelText("City or postal code")).toBeInTheDocument();
  });

  it("gives the location progress indicator an accessible name", () => {
    const geolocation: GeolocationProvider = {
      getCurrentPosition: vi.fn(),
    };

    render(
      <LocationInput
        geocoder={new FakeGeocoder()}
        onResolve={vi.fn()}
        onResolveError={vi.fn()}
        geolocation={geolocation}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Detecting your location" }),
    ).toBeInTheDocument();
  });

  it("resolves automatically when geolocation is granted", async () => {
    const onResolve = vi.fn();
    const geolocation: GeolocationProvider = {
      getCurrentPosition: (success) => success(positionAt(39.1, -94.6)),
    };

    render(
      <LocationInput
        geocoder={new FakeGeocoder()}
        onResolve={onResolve}
        onResolveError={vi.fn()}
        geolocation={geolocation}
      />,
    );

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ lat: 39.1, lng: -94.6 }));
    expect(await screen.findByText(/using your current location/i)).toBeInTheDocument();
  });

  it("falls back to manual entry when permission is denied", async () => {
    const onResolve = vi.fn();
    const denied: GeolocationPositionError = {
      code: 1,
      message: "User denied geolocation",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    };
    const geolocation: GeolocationProvider = {
      getCurrentPosition: (_success, error) => error?.(denied),
    };

    render(
      <LocationInput
        geocoder={new FakeGeocoder()}
        onResolve={onResolve}
        onResolveError={vi.fn()}
        geolocation={geolocation}
      />,
    );

    expect(await screen.findByText(/location permission denied/i)).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("resolves a manually entered location via the geocoder", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const geocoder = new FakeGeocoder({ "kansas city": { lat: 39.1, lng: -94.6 } });

    render(
      <LocationInput
        geocoder={geocoder}
        onResolve={onResolve}
        onResolveError={vi.fn()}
        geolocation={undefined}
      />,
    );

    await user.type(screen.getByLabelText("City or postal code"), "Kansas City");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ lat: 39.1, lng: -94.6 }));
  });

  it("recovers the form and reports when geocoding fails", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const onResolveError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <LocationInput
        geocoder={new FakeGeocoder()}
        onResolve={onResolve}
        onResolveError={onResolveError}
        geolocation={undefined}
      />,
    );

    const input = screen.getByLabelText("City or postal code");
    await user.type(input, "nowhere");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Could not geolocate right now.")).toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(onResolveError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("Location geocoding failed", expect.any(Error));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("distinguishes a geocoder service failure from no results", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const geocoder: Geocoder = {
      geocode: () => Promise.reject(new GeocodingError("REQUEST_DENIED")),
    };

    render(
      <LocationInput
        geocoder={geocoder}
        onResolve={vi.fn()}
        onResolveError={vi.fn()}
        geolocation={undefined}
      />,
    );

    await user.type(screen.getByLabelText("City or postal code"), "Indianapolis, IN");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Could not geolocate right now.")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Location geocoding failed",
      expect.objectContaining({ status: "REQUEST_DENIED" }),
    );
  });

  it("ignores a geocoding failure after unmount", async () => {
    const rejections: Array<(reason: Error) => void> = [];
    const geocoder: Geocoder = {
      geocode: () =>
        new Promise((_resolve, reject) => {
          rejections.push(reject);
        }),
    };
    const onResolveError = vi.fn();
    const { unmount } = render(
      <LocationInput
        geocoder={geocoder}
        onResolve={vi.fn()}
        onResolveError={onResolveError}
        geolocation={undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("City or postal code"), {
      target: { value: "Indianapolis, IN" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    unmount();
    await act(async () => rejections[0]?.(new Error("late failure")));

    expect(onResolveError).not.toHaveBeenCalled();
  });

  it("times out a hung geocoder and restores the controls", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const geocoder: Geocoder = { geocode: () => new Promise(() => undefined) };

    render(
      <LocationInput
        geocoder={geocoder}
        onResolve={vi.fn()}
        onResolveError={vi.fn()}
        geolocation={undefined}
      />,
    );

    const input = screen.getByLabelText("City or postal code");
    fireEvent.change(input, { target: { value: "Indianapolis, IN" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Searching…" })).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(screen.getByText("Could not geolocate right now.")).toBeInTheDocument();
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });
});
