import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../firebase";
import { GEOCODING_TIMEOUT_MS, type Geocoder } from "./geocoder";
import AddLocationForm, { ISSUE_REPORT_URL } from "./AddLocationForm";
import { addLocation } from "./addLocation";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
  geohashForLocation: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: firebase.addDoc,
  collection: firebase.collection,
  serverTimestamp: firebase.serverTimestamp,
}));
vi.mock("geofire-common", () => ({ geohashForLocation: firebase.geohashForLocation }));

describe("addLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.collection.mockReturnValue("locations-ref");
    firebase.serverTimestamp.mockReturnValue("server-time");
    firebase.geohashForLocation.mockReturnValue("9yzgcjb0dz");
  });

  it("geocodes and attributes a new location", async () => {
    const geocode = vi.fn().mockResolvedValue({ lat: 39.1, lng: -94.6 });
    const geocoder: Geocoder = { geocode };

    await addLocation(
      db,
      geocoder,
      { id: "fan-123", name: "  Soda Fan  " },
      {
        name: "  Corner Shop  ",
        street: "  1 Main St ",
        city: " Kansas City ",
        state: " mo ",
        postalCode: " 64106 ",
      },
    );

    expect(geocode).toHaveBeenCalledWith("1 Main St, Kansas City, MO 64106");
    expect(firebase.collection).toHaveBeenCalledWith(db, "locations");
    expect(firebase.addDoc).toHaveBeenCalledWith("locations-ref", {
      name: "Corner Shop",
      address: {
        street: "1 Main St",
        city: "Kansas City",
        state: "MO",
        postalCode: "64106",
      },
      geo: { lat: 39.1, lng: -94.6 },
      geohash: "9yzgcjb0dz",
      createdBy: "fan-123",
      createdByName: "Soda Fan",
      createdAt: "server-time",
      updatedBy: "fan-123",
      updatedByName: "Soda Fan",
      updatedAt: "server-time",
    });
  });

  it("stores an empty sentinel when the contributor does not have a friendly name", async () => {
    const geocoder: Geocoder = { geocode: vi.fn().mockResolvedValue({ lat: 39.1, lng: -94.6 }) };

    await addLocation(
      db,
      geocoder,
      { id: "fan-123" },
      {
        name: "Corner Shop",
        street: "1 Main St",
        city: "Kansas City",
        state: "MO",
        postalCode: "64106",
      },
    );

    expect(firebase.addDoc).toHaveBeenCalledWith(
      "locations-ref",
      expect.objectContaining({ createdByName: "", updatedByName: "" }),
    );
  });

  it("rejects malformed coordinates before writing", async () => {
    const geocoder: Geocoder = { geocode: vi.fn().mockResolvedValue({ lat: 91, lng: -94.6 }) };

    await expect(
      addLocation(
        db,
        geocoder,
        { id: "fan-123" },
        {
          name: "Corner Shop",
          street: "1 Main St",
          city: "Kansas City",
          state: "MO",
          postalCode: "64106",
        },
      ),
    ).rejects.toThrow();

    expect(firebase.addDoc).not.toHaveBeenCalled();
    expect(firebase.serverTimestamp).not.toHaveBeenCalled();
  });

  it("rejects a geocoding request that never settles", async () => {
    vi.useFakeTimers();
    const geocoder: Geocoder = { geocode: vi.fn(() => new Promise<never>(() => undefined)) };

    try {
      const result = expect(
        addLocation(
          db,
          geocoder,
          { id: "fan-123" },
          {
            name: "Corner Shop",
            street: "1 Main St",
            city: "Kansas City",
            state: "MO",
            postalCode: "64106",
          },
        ),
      ).rejects.toThrow("Geocoding request timed out");

      await vi.advanceTimersByTimeAsync(GEOCODING_TIMEOUT_MS);
      await result;
      expect(firebase.addDoc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AddLocationForm", () => {
  it("requires every field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<AddLocationForm onSave={onSave} onAdded={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add location" }));

    expect(screen.getByText("Complete every field before adding the location.")).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits a complete location and reports success", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onAdded = vi.fn();
    render(<AddLocationForm onSave={onSave} onAdded={onAdded} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/location name/i), "Corner Shop");
    await user.type(screen.getByLabelText(/street address/i), "1 Main St");
    await user.type(screen.getByLabelText(/^city/i), "Kansas City");
    await user.type(screen.getByLabelText(/^state/i), "MO");
    await user.type(screen.getByLabelText(/postal code/i), "64106");
    await user.click(screen.getByRole("button", { name: "Add location" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Corner Shop"));
    expect(onSave).toHaveBeenCalledWith({
      name: "Corner Shop",
      street: "1 Main St",
      city: "Kansas City",
      state: "MO",
      postalCode: "64106",
    });
  });

  it("reports save failures and restores the submit button", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("geocoding failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<AddLocationForm onSave={onSave} onAdded={vi.fn()} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText(/location name/i), "Corner Shop");
    await user.type(screen.getByLabelText(/street address/i), "1 Main St");
    await user.type(screen.getByLabelText(/^city/i), "Kansas City");
    await user.type(screen.getByLabelText(/^state/i), "MO");
    await user.type(screen.getByLabelText(/postal code/i), "64106");
    await user.click(screen.getByRole("button", { name: "Add location" }));

    expect(
      await screen.findByText("Something went wrong while adding this location."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Report the problem." })).toHaveAttribute(
      "href",
      ISSUE_REPORT_URL,
    );
    expect(screen.getByRole("button", { name: "Add location" })).toBeEnabled();
    consoleError.mockRestore();
  });
});
