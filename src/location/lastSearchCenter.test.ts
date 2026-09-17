import { describe, expect, it, vi } from "vitest";
import { loadLastSearchCenter, saveLastSearchCenter } from "./lastSearchCenter";

function storageWith(value: string | null) {
  return {
    getItem: vi.fn().mockReturnValue(value),
    setItem: vi.fn(),
  };
}

describe("last search center", () => {
  it("loads a saved valid coordinate", () => {
    const storage = storageWith('{"lat":39.1,"lng":-94.6}');

    expect(loadLastSearchCenter(storage)).toEqual({ lat: 39.1, lng: -94.6 });
  });

  it.each([
    ["missing", null],
    ["malformed", "not-json"],
    ["out-of-range", '{"lat":91,"lng":-94.6}'],
    ["non-numeric", '{"lat":"39.1","lng":-94.6}'],
  ])("ignores %s stored values", (_label, value) => {
    expect(loadLastSearchCenter(storageWith(value))).toBeUndefined();
  });

  it("saves a valid coordinate", () => {
    const storage = storageWith(null);

    saveLastSearchCenter({ lat: 39.1, lng: -94.6 }, storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      "simply-fizzed:last-search-center",
      '{"lat":39.1,"lng":-94.6}',
    );
  });

  it("continues when browser storage is unavailable", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("full");
      }),
    };

    expect(loadLastSearchCenter(storage)).toBeUndefined();
    expect(() => saveLastSearchCenter({ lat: 39.1, lng: -94.6 }, storage)).not.toThrow();
  });
});
