import type { Firestore } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock("firebase/firestore", () => firebase);

import {
  formatSodaUpdatedAt,
  isAvailabilityReferenceId,
  loadSodaCatalog,
  normalizeSodaSearch,
  parseSoda,
  rankSodas,
  type SodaDocument,
} from "./sodas";

const sodas: SodaDocument[] = [
  {
    id: "coke-original",
    brand: "Coca-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke", "Coca Cola"],
  },
  {
    id: "coke-zero",
    brand: "Coca-Cola",
    name: "Zero Sugar",
    flavor: "Cola",
    aliases: ["Coke", "Coke Zero"],
  },
  {
    id: "pepsi",
    brand: "Pepsi-Cola",
    name: "Cola",
    flavor: "Original",
    aliases: ["Coke", "Pepsi"],
  },
];

describe("availability catalog IDs", () => {
  it("reserves the canonical tuple separator", () => {
    expect(isAvailabilityReferenceId("coca-cola-zero")).toBe(true);
    expect(isAvailabilityReferenceId("coca$cola")).toBe(false);
  });

  it("excludes catalog entries that cannot be referenced by availability", async () => {
    firebase.getDocs.mockResolvedValue({
      docs: [
        {
          id: "coca-cola",
          data: () => ({ brand: "Coca-Cola", name: "Cola", flavor: "Original" }),
        },
        {
          id: "coca$cola",
          data: () => ({ brand: "Coca-Cola", name: "Cola", flavor: "Original" }),
        },
      ],
    });

    const db = vi.fn<() => Firestore>()();
    await expect(loadSodaCatalog(db)).resolves.toEqual([
      { id: "coca-cola", brand: "Coca-Cola", name: "Cola", flavor: "Original" },
    ]);
  });
});

describe("parseSoda", () => {
  it("parses optional aliases", () => {
    expect(parseSoda("cola", sodas[0])).toEqual({
      id: "cola",
      brand: "Coca-Cola",
      name: "Cola",
      flavor: "Original",
      aliases: ["Coke", "Coca Cola"],
    });
    expect(parseSoda("plain", { brand: "Brand", name: "Name", flavor: "Flavor" })).toEqual({
      id: "plain",
      brand: "Brand",
      name: "Name",
      flavor: "Flavor",
    });
  });

  it("parses valid update attribution", () => {
    const updatedAt = new Date("2026-09-23T02:48:11Z");

    expect(
      parseSoda("cola", {
        brand: "Brand",
        name: "Name",
        flavor: "Flavor",
        updatedByName: "Soda Fan",
        updatedAt: { toDate: () => updatedAt },
      }),
    ).toEqual({
      id: "cola",
      brand: "Brand",
      name: "Name",
      flavor: "Flavor",
      updatedByName: "Soda Fan",
      updatedAt,
    });
  });

  it.each([
    ["name only", { updatedByName: "Soda Fan" }],
    ["timestamp only", { updatedAt: { toDate: () => new Date("2026-09-23T02:48:11Z") } }],
  ])("rejects partial update attribution with %s", (_case, attribution) => {
    expect(
      parseSoda("cola", {
        brand: "Brand",
        name: "Name",
        flavor: "Flavor",
        ...attribution,
      }),
    ).toBeUndefined();
  });

  it("rejects malformed update attribution", () => {
    expect(
      parseSoda("cola", {
        brand: "Brand",
        name: "Name",
        flavor: "Flavor",
        updatedByName: "   ",
        updatedAt: { toDate: () => new Date(Number.NaN) },
      }),
    ).toBeUndefined();
  });

  it("rejects malformed canonical fields or aliases", () => {
    expect(parseSoda("bad", { brand: "Brand", name: "", flavor: "Cola" })).toBeUndefined();
    expect(
      parseSoda("bad", { brand: "Brand", name: "Cola", flavor: "Cola", aliases: [42] }),
    ).toBeUndefined();
  });
});

describe("formatSodaUpdatedAt", () => {
  it("formats the date and time for contrasting requested locales", () => {
    const updatedAt = new Date(2026, 8, 23, 15, 30);

    expect(formatSodaUpdatedAt(updatedAt, "en-US")).toBe("Sep 23, 2026, 3:30 PM");
    expect(formatSodaUpdatedAt(updatedAt, "de-DE")).toBe("23.09.2026, 15:30");
  });
});

describe("canonical soda search", () => {
  it("normalizes case, diacritics, punctuation, hyphens, ampersands, and whitespace", () => {
    expect(normalizeSodaSearch("  CAFÉ-Cola & Lime!!!  ")).toBe("cafe cola and lime");
  });

  it("keeps an ambiguous exact alias as explicit exact choices", () => {
    expect(rankSodas(sodas, "coke").map((soda) => soda.id)).toEqual([
      "coke-original",
      "coke-zero",
      "pepsi",
    ]);
  });

  it("ranks exact canonical matches ahead of prefix and token matches", () => {
    expect(rankSodas(sodas, "Coca Cola Zero Sugar Cola")[0]?.id).toBe("coke-zero");
    expect(rankSodas(sodas, "zero sug").map((soda) => soda.id)).toEqual(["coke-zero"]);
  });

  it("allows conservative typos without discarding variant words", () => {
    expect(rankSodas(sodas, "pepsu").map((soda) => soda.id)).toEqual(["pepsi"]);
    expect(rankSodas(sodas, "coke original").map((soda) => soda.id)).toEqual([
      "coke-original",
      "pepsi",
    ]);
    expect(rankSodas(sodas, "coke diet")).toEqual([]);
  });
});
