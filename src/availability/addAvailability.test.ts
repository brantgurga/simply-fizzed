import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => {
  const generatedSodaReference = { id: "generated-soda" };
  const batch = { set: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
  return {
    batch,
    generatedSodaReference,
    collection: vi.fn(() => "sodas"),
    doc: vi.fn((...parts: unknown[]) =>
      parts.length === 1 ? generatedSodaReference : parts.slice(1).join("/"),
    ),
    serverTimestamp: vi.fn(() => "server-time"),
    setDoc: vi.fn(() => Promise.resolve()),
    timestampFromDate: vi.fn((date: Date) => ({ date })),
    updateDoc: vi.fn(() => Promise.resolve()),
    writeBatch: vi.fn(() => batch),
  };
});

vi.mock("firebase/firestore", () => ({
  collection: firebase.collection,
  doc: firebase.doc,
  serverTimestamp: firebase.serverTimestamp,
  setDoc: firebase.setDoc,
  Timestamp: { fromDate: firebase.timestampFromDate },
  updateDoc: firebase.updateDoc,
  writeBatch: firebase.writeBatch,
}));

import {
  addAvailability,
  addNewSodaAvailability,
  availabilityDocumentId,
  updateAvailabilityDetails,
} from "./addAvailability";

const db = vi.fn<() => Firestore>()();
const details = { canSample: "yes", canPurchase: "no" } as const;
const soda = {
  id: "soda-one",
  name: "Zero Sugar",
  brand: "Coca-Cola",
  flavor: "Cola",
};
const actionTime = new Date("2026-09-26T12:00:00Z");

describe("availability writes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deterministically encodes all identity fields", () => {
    expect(availabilityDocumentId("location-one", "soda-one", "bottle")).toBe(
      "location-one$soda-one$bottle",
    );
    expect(() => availabilityDocumentId("location$one", "soda", "can")).toThrow(
      "cannot contain '$'",
    );
  });

  it("queues exact details, attribution, and the local action time without reads", async () => {
    const queued = addAvailability(
      db,
      "location-one",
      soda,
      "bottle",
      details,
      { id: "fan-123", name: " Soda Fan " },
      actionTime,
    );

    expect(queued.value).toMatchObject({
      sodaId: "soda-one",
      canSample: "yes",
      canPurchase: "no",
      createdByName: "Soda Fan",
      updatedAt: actionTime,
    });
    expect(firebase.setDoc).toHaveBeenCalledWith(
      "availability/location-one$soda-one$bottle",
      expect.objectContaining({
        canSample: "yes",
        createdAt: { date: actionTime },
        updatedAt: { date: actionTime },
      }),
    );
    await expect(queued.committed).resolves.toBeUndefined();
  });

  it("queues a canonical soda and first availability in one batch", async () => {
    const queued = addNewSodaAvailability(
      db,
      "location-one",
      { brand: " Sprecher ", name: " Root Beer ", flavor: " Original " },
      "draft",
      { canSample: "unknown", canPurchase: "yes" },
      { id: "fan-123", name: " Soda Fan " },
      actionTime,
    );

    expect(queued.value.soda).toEqual({
      id: "generated-soda",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Original",
    });
    expect(firebase.batch.set).toHaveBeenNthCalledWith(
      1,
      firebase.generatedSodaReference,
      expect.objectContaining({ createdAt: "server-time" }),
    );
    expect(firebase.batch.set).toHaveBeenNthCalledWith(
      2,
      "availability/location-one$generated-soda$draft",
      expect.objectContaining({ canPurchase: "yes", updatedAt: { date: actionTime } }),
    );
    await expect(queued.committed).resolves.toBeUndefined();
  });

  it("updates only editable details and local update attribution", async () => {
    const existing = {
      ...addAvailability(
        db,
        "location-one",
        soda,
        "can",
        { canSample: "unknown", canPurchase: "unknown" },
        { id: "creator" },
        new Date("2026-01-01T00:00:00Z"),
      ).value,
      documentId: "legacy-record-id",
    };
    const queued = updateAvailabilityDetails(
      db,
      existing,
      details,
      { id: "fan-123", name: "Soda Fan" },
      actionTime,
    );

    expect(queued.value).toMatchObject({ ...details, updatedBy: "fan-123", updatedAt: actionTime });
    expect(firebase.updateDoc).toHaveBeenCalledWith("availability/legacy-record-id", {
      ...details,
      updatedBy: "fan-123",
      updatedByName: "Soda Fan",
      updatedAt: { date: actionTime },
    });
  });

  it("validates before queueing a malformed write", () => {
    expect(() =>
      addAvailability(db, "location-one", soda, "can", details, { id: "   " }, actionTime),
    ).toThrow();
    expect(firebase.setDoc).not.toHaveBeenCalled();
  });
});
