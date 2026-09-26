import type { Firestore } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  addDoc: vi.fn(() => Promise.resolve({ id: "verification-1" })),
  collection: vi.fn(() => "verifications"),
  getDocs: vi.fn(),
  limit: vi.fn((value: number) => ({ limit: value })),
  orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
  query: vi.fn((...parts: unknown[]) => parts),
  timestampFromDate: vi.fn((date: Date) => ({ date })),
  where: vi.fn((field: string, operation: string, value: string) => ({
    field,
    operation,
    value,
  })),
}));

vi.mock("firebase/firestore", () => ({
  addDoc: firebase.addDoc,
  collection: firebase.collection,
  getDocs: firebase.getDocs,
  limit: firebase.limit,
  orderBy: firebase.orderBy,
  query: firebase.query,
  Timestamp: { fromDate: firebase.timestampFromDate },
  where: firebase.where,
}));

import {
  compareVerifications,
  confirmLocationAvailability,
  loadLatestVerification,
  parseVerification,
} from "./locationVerification";

const db = vi.fn<() => Firestore>()();

function rawVerification(verifiedBy: string, verifiedAt: Date) {
  return {
    locationId: "location-one",
    verifiedBy,
    verifiedByName: `${verifiedBy} name`,
    verifiedAt: { toDate: () => verifiedAt },
  };
}

describe("location verification", () => {
  it("parses verification timestamps and rejects malformed data", () => {
    const verifiedAt = new Date("2026-09-26T12:00:00Z");
    expect(parseVerification(rawVerification("fan-1", verifiedAt))).toEqual({
      locationId: "location-one",
      verifiedBy: "fan-1",
      verifiedByName: "fan-1 name",
      verifiedAt,
    });
    expect(parseVerification({ ...rawVerification("fan-1", verifiedAt), verifiedBy: "" })).toBe(
      undefined,
    );
  });

  it("orders by action time and then ascending UID", () => {
    const earlier = parseVerification(rawVerification("a-user", new Date("2026-09-26T11:00:00Z")))!;
    const laterLowercase = parseVerification(
      rawVerification("a-user", new Date("2026-09-26T12:00:00Z")),
    )!;
    const laterUppercase = parseVerification(
      rawVerification("A-user", new Date("2026-09-26T12:00:00Z")),
    )!;

    expect([earlier, laterLowercase, laterUppercase].toSorted(compareVerifications)).toEqual([
      laterUppercase,
      laterLowercase,
      earlier,
    ]);
  });

  it("loads the latest valid event independently of synchronization order", async () => {
    const first = rawVerification("a-user", new Date("2026-09-26T12:00:00Z"));
    const second = rawVerification("b-user", new Date("2026-09-26T13:00:00Z"));
    firebase.getDocs.mockResolvedValue({
      docs: [{ data: () => first }, { data: () => ({ locationId: 42 }) }, { data: () => second }],
    });

    await expect(loadLatestVerification(db, "location-one")).resolves.toEqual({
      latest: expect.objectContaining({ verifiedBy: "b-user" }),
      malformedCount: 1,
    });
  });

  it("queues append-only confirmation with its local action time", async () => {
    const actionTime = new Date("2026-09-26T12:00:00Z");
    const queued = confirmLocationAvailability(
      db,
      "location-one",
      { id: "fan-1", name: " Soda Fan " },
      actionTime,
    );

    expect(queued.value).toEqual({
      locationId: "location-one",
      verifiedBy: "fan-1",
      verifiedByName: "Soda Fan",
      verifiedAt: actionTime,
    });
    expect(firebase.addDoc).toHaveBeenCalledWith("verifications", {
      ...queued.value,
      verifiedAt: { date: actionTime },
    });
    await expect(queued.committed).resolves.toBeUndefined();
  });
});
