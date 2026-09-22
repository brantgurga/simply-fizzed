import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NearbyLocation } from "./results";
import NearbySearch, { type NearbySearcher } from "./NearbySearch";

const center = { lat: 39.0997, lng: -94.5786 };

function expectUnknownAttributionCount(values: readonly HTMLElement[], count: number): void {
  expect(values.filter((value) => value.style.fontStyle === "italic")).toHaveLength(count);
}

function nearby(id: string, name: string, distanceMiles: number): NearbyLocation {
  return {
    location: {
      id,
      name,
      address: { street: "1 Main St", city: "Kansas City", state: "MO", postalCode: "64106" },
      geo: { lat: 39.1, lng: -94.6 },
      geohash: "9yzgcjb0dz",
    },
    distanceMiles,
    availability: [
      {
        locationId: id,
        sodaId: "soda-1",
        form: "can",
        sodaName: "Root Beer",
        sodaBrand: "Big K",
        sodaFlavor: "root beer",
      },
    ],
  };
}

describe("NearbySearch", () => {
  it("shows a loading state while searching", () => {
    render(<NearbySearch center={center} search={() => new Promise(() => {})} />);

    expect(screen.getByText(/searching for soda near you/i)).toBeInTheDocument();
  });

  it("renders results nearest-first with their sodas", async () => {
    const results = [nearby("loc-1", "Tim's Brewery", 2.3), nearby("loc-2", "Corner Store", 12.5)];

    render(<NearbySearch center={center} search={() => Promise.resolve(results)} />);

    expect(await screen.findByRole("heading", { name: "Tim's Brewery" })).toBeInTheDocument();
    expect(screen.getByText("2.3 miles away")).toBeInTheDocument();
    expect(screen.getByText("12.5 miles away")).toBeInTheDocument();
    expect(screen.getAllByText("Big K Root Beer in cans")).toHaveLength(2);
  });

  it("styles missing attribution differently from a contributor named Unknown", async () => {
    const attributed = nearby("loc-1", "Attributed Store", 2.3);
    attributed.location.updatedAt = new Date("2026-09-19T15:30:00Z");
    attributed.location.updatedByName = "Unknown";
    const unattributed = nearby("loc-2", "Legacy Store", 3.1);

    render(
      <NearbySearch center={center} search={() => Promise.resolve([attributed, unattributed])} />,
    );

    await screen.findByRole("heading", { name: "Attributed Store" });
    const unknownValues = screen.getAllByText("Unknown");
    expect(unknownValues).toHaveLength(3);
    expectUnknownAttributionCount(unknownValues, 2);
  });

  it("shows an empty message when nothing is within range", async () => {
    render(<NearbySearch center={center} search={() => Promise.resolve([])} />);

    expect(await screen.findByText(/no soda found within 60 miles/i)).toBeInTheDocument();
  });

  it("shows an error message when the search fails", async () => {
    render(<NearbySearch center={center} search={() => Promise.reject(new Error("boom"))} />);

    expect(await screen.findByText(/something went wrong while searching/i)).toBeInTheDocument();
  });

  it("re-runs the search when the center changes", async () => {
    const search = vi.fn(() => Promise.resolve([nearby("loc-1", "Tim's Brewery", 2.3)]));
    const { rerender } = render(<NearbySearch center={center} search={search} />);

    await screen.findByRole("heading", { name: "Tim's Brewery" });
    rerender(<NearbySearch center={{ lat: 40, lng: -95 }} search={search} />);

    await screen.findByRole("heading", { name: "Tim's Brewery" });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("returns to the loading state while re-searching after the center changes", async () => {
    let resolveSecond: ((value: NearbyLocation[]) => void) | undefined;
    const search = vi
      .fn<NearbySearcher>()
      .mockReturnValueOnce(Promise.resolve([nearby("loc-1", "First Place", 2.3)]))
      .mockReturnValueOnce(
        new Promise<NearbyLocation[]>((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const { rerender } = render(<NearbySearch center={center} search={search} />);
    await screen.findByRole("heading", { name: "First Place" });

    rerender(<NearbySearch center={{ lat: 40, lng: -95 }} search={search} />);

    // The render-phase reset must show loading again immediately, before the
    // second search resolves, rather than leaving the stale results visible.
    expect(screen.getByText(/searching for soda near you/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First Place" })).toBeNull();

    resolveSecond?.([nearby("loc-2", "Second Place", 1.1)]);

    expect(await screen.findByRole("heading", { name: "Second Place" })).toBeInTheDocument();
  });

  it("shows a placeholder for a location with no sodas listed", async () => {
    const result = nearby("loc-1", "Empty Store", 3.1);
    result.availability = [];

    render(<NearbySearch center={center} search={() => Promise.resolve([result])} />);

    expect(await screen.findByRole("heading", { name: "Empty Store" })).toBeInTheDocument();
    expect(screen.getByText(/no sodas listed yet/i)).toBeInTheDocument();
  });

  it("ignores a stale search result after the center changes", async () => {
    let resolveStale: ((value: NearbyLocation[]) => void) | undefined;
    const stale = new Promise<NearbyLocation[]>((resolve) => {
      resolveStale = resolve;
    });
    const search = vi
      .fn<NearbySearcher>()
      .mockReturnValueOnce(stale)
      .mockReturnValueOnce(Promise.resolve([nearby("loc-2", "Current", 1)]));

    const { rerender } = render(<NearbySearch center={center} search={search} />);
    rerender(<NearbySearch center={{ lat: 40, lng: -95 }} search={search} />);

    expect(await screen.findByRole("heading", { name: "Current" })).toBeInTheDocument();

    resolveStale?.([nearby("loc-1", "Stale", 1)]);
    await Promise.resolve();

    expect(screen.queryByRole("heading", { name: "Stale" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Current" })).toBeInTheDocument();
  });
});
