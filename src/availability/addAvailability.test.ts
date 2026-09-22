import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn((...parts: unknown[]) => parts.slice(1).join("/")),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("firebase/firestore", () => ({
  collection: firebase.collection,
  doc: firebase.doc,
  getDoc: firebase.getDoc,
  getDocs: firebase.getDocs,
  runTransaction: firebase.runTransaction,
  serverTimestamp: firebase.serverTimestamp,
}));

import {
  addAvailability,
  availabilityDocumentId,
  DuplicateAvailabilityError,
} from "./addAvailability";

const db = vi.fn<() => Firestore>()();

function snapshot(exists: boolean, id = "", data: unknown = {}): object {
  return { exists: () => exists, id, data: () => data };
}

describe("availabilityDocumentId", () => {
  it("deterministically encodes all identity fields", () => {
    expect(availabilityDocumentId("location-one", "soda-one", "bottle")).toBe(
      "location-one$soda-one$bottle",
    );
    expect(availabilityDocumentId("location", "soda", "can")).not.toBe(
      availabilityDocumentId("location", "soda", "draft"),
    );
  });

  it("rejects the reserved separator in referenced IDs", () => {
    expect(() => availabilityDocumentId("location$one", "soda", "can")).toThrow(
      "cannot contain '$'",
    );
    expect(() => availabilityDocumentId("location", "soda$one", "can")).toThrow(
      "cannot contain '$'",
    );
  });
});

describe("addAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transactionally creates exact denormalized and attributed data", async () => {
    const set = vi.fn();
    const get = vi.fn(async (reference: unknown) => {
      const path = String(reference);
      if (path === "locations/location-one") return snapshot(true);
      if (path === "sodas/soda-one") {
        return snapshot(true, "soda-one", {
          name: "Zero Sugar",
          brand: "Coca-Cola",
          flavor: "Cola",
          aliases: ["Coke Zero"],
        });
      }
      return snapshot(false);
    });
    firebase.runTransaction.mockImplementation(
      async (
        _database: unknown,
        update: (transaction: { get: typeof get; set: typeof set }) => Promise<unknown>,
      ) => update({ get, set }),
    );

    await expect(
      addAvailability(db, "location-one", "soda-one", "bottle", {
        id: "fan-123",
        name: " Soda Fan ",
      }),
    ).resolves.toMatchObject({
      sodaId: "soda-one",
      form: "bottle",
      sodaName: "Zero Sugar",
      sodaBrand: "Coca-Cola",
      sodaFlavor: "Cola",
      createdBy: "fan-123",
      updatedBy: "fan-123",
    });
    expect(set).toHaveBeenCalledWith(
      "availability/location-one$soda-one$bottle",
      expect.objectContaining({
        createdByName: "Soda Fan",
        updatedByName: "Soda Fan",
        createdAt: "server-time",
        updatedAt: "server-time",
      }),
    );
  });

  it("rejects a duplicate before writing", async () => {
    const set = vi.fn();
    const get = vi.fn(async (reference: unknown) => {
      const path = String(reference);
      if (path.startsWith("locations/")) return snapshot(true);
      if (path.startsWith("sodas/")) {
        return snapshot(true, "soda-one", { name: "Cola", brand: "Brand", flavor: "Cola" });
      }
      return snapshot(true);
    });
    firebase.runTransaction.mockImplementation(
      async (
        _database: unknown,
        update: (transaction: { get: typeof get; set: typeof set }) => Promise<unknown>,
      ) => update({ get, set }),
    );

    await expect(
      addAvailability(db, "location-one", "soda-one", "can", { id: "fan-123" }),
    ).rejects.toBeInstanceOf(DuplicateAvailabilityError);
    expect(set).not.toHaveBeenCalled();
  });
});
