import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FakeGeocoder } from "./geocoder";
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
  it("shows the manual form when geolocation is unavailable", () => {
    render(
      <LocationInput geocoder={new FakeGeocoder()} onResolve={vi.fn()} geolocation={undefined} />,
    );

    expect(screen.getByText(/location access isn't available/i)).toBeInTheDocument();
    expect(screen.getByLabelText("City or postal code")).toBeInTheDocument();
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

    render(<LocationInput geocoder={geocoder} onResolve={onResolve} geolocation={undefined} />);

    await user.type(screen.getByLabelText("City or postal code"), "Kansas City");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ lat: 39.1, lng: -94.6 }));
  });

  it("shows an error when geocoding fails", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    render(
      <LocationInput geocoder={new FakeGeocoder()} onResolve={onResolve} geolocation={undefined} />,
    );

    await user.type(screen.getByLabelText("City or postal code"), "nowhere");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/couldn't find that location/i)).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
  });
});
