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

  it("rejects malformed canonical fields or aliases", () => {
    expect(parseSoda("bad", { brand: "Brand", name: "", flavor: "Cola" })).toBeUndefined();
    expect(
      parseSoda("bad", { brand: "Brand", name: "Cola", flavor: "Cola", aliases: [42] }),
    ).toBeUndefined();
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
