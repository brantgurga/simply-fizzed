// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mapMocks = vi.hoisted(() => {
  const addListener = vi.fn();
  const fitBounds = vi.fn();
  const getCenter = vi.fn();
  const setCenter = vi.fn();
  const mapConstructor = vi.fn(function MapConstructor() {
    return { addListener, fitBounds, getCenter, setCenter };
  });
  const markerConstructor = vi.fn(function MarkerConstructor() {
    return { addListener: vi.fn() };
  });
  const floatPane = document.createElement("div");
  const preventMapHitsAndGesturesFrom = vi.fn();
  return {
    addListener,
    fitBounds,
    floatPane,
    getCenter,
    mapConstructor,
    markerConstructor,
    preventMapHitsAndGesturesFrom,
    setCenter,
  };
});

vi.mock("@googlemaps/markerclusterer", () => ({
  MarkerClusterer: vi.fn(function MarkerClusterer() {
    return { clearMarkers: vi.fn(), setMap: vi.fn() };
  }),
}));
vi.mock("../location/geocoder", () => ({
  loadGoogleMapsApi: vi.fn().mockResolvedValue({
    maps: {
      importLibrary: vi.fn((name: string) => {
        if (name === "core")
          return {
            ColorScheme: { FOLLOW_SYSTEM: "FOLLOW_SYSTEM" },
            LatLngBounds: class {
              extend = vi.fn();
            },
          };
        if (name === "maps") {
          return {
            OverlayView: class {
              static preventMapHitsAndGesturesFrom(element: Element) {
                mapMocks.preventMapHitsAndGesturesFrom(element);
              }
              onAdd() {}
              onRemove() {}
              draw() {}
              getPanes() {
                return { floatPane: mapMocks.floatPane };
              }
              getProjection() {
                return { fromLatLngToDivPixel: () => ({ x: 120, y: 80 }) };
              }
              setMap(map: unknown) {
                if (map === null) this.onRemove();
                else {
                  this.onAdd();
                  this.draw();
                }
              }
            },
            Map: mapMocks.mapConstructor,
          };
        }
        return { AdvancedMarkerElement: mapMocks.markerConstructor };
      }),
    },
  }),
}));

import SodaCatalog from "./SodaCatalog";

const loader = vi.fn().mockResolvedValue({
  locations: [],
  items: [
    {
      id: "sprecher-root",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Root Beer",
      averageRating: 4.5,
      ratingCount: 8,
      tried: false,
      availability: [],
    },
    {
      id: "lemon-up",
      brand: "7-Up",
      name: "Lemon-Up",
      flavor: "Lemon-Lime",
      ratingCount: 0,
      tried: false,
      availability: [],
    },
  ],
});

describe("SodaCatalog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mapMocks.floatPane.replaceChildren();
  });

  it("renders compact catalog entries with rating evidence", async () => {
    render(<SodaCatalog parameters={new URLSearchParams()} loader={loader} />);

    expect(await screen.findByRole("heading", { name: "Soda varieties" })).toBeVisible();
    expect(screen.getByText("4.5 mugs (8 ratings)")).toBeVisible();
    expect(screen.getByText("Not yet rated")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Sprecher Root Beer Root Beer 4.5 mugs/i }),
    ).toHaveAttribute("href", "#/sodas/sprecher-root");
  });

  it("filters the same soda by terms from different fields", async () => {
    render(
      <SodaCatalog parameters={new URLSearchParams({ q: "sprecher root" })} loader={loader} />,
    );

    expect(await screen.findByText("1 matching soda variety")).toBeVisible();
    expect(screen.queryByText("Lemon-Up")).not.toBeInTheDocument();
  });

  it("owns the accessible popup DOM through the documented overlay API", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubEnv("VITE_GOOGLE_MAPS_MAP_ID", "test-map-id");
    const mapLoader = vi.fn().mockResolvedValue({
      locations: [
        {
          id: "shop",
          name: "Soda Shop",
          address: { street: "1 Main St", city: "Indy", state: "IN", postalCode: "46204" },
          geo: { lat: 39.77, lng: -86.16 },
          geohash: "dp4dpr",
        },
      ],
      items: [
        {
          id: "sprecher-root",
          brand: "Sprecher",
          name: "Root Beer",
          flavor: "Root Beer",
          ratingCount: 0,
          tried: false,
          availability: [
            {
              id: "available",
              locationId: "shop",
              sodaId: "sprecher-root",
              form: "draft",
              canSample: "yes",
              canPurchase: "yes",
            },
          ],
        },
      ],
    });
    render(<SodaCatalog parameters={new URLSearchParams({ view: "map" })} loader={mapLoader} />);
    await waitFor(() => expect(mapMocks.markerConstructor).toHaveBeenCalledTimes(1));
    const marker = mapMocks.markerConstructor.mock.results[0]?.value;
    const click = marker?.addListener.mock.calls.find(
      (call: unknown[]) => call[0] === "click",
    )?.[1];
    if (typeof click !== "function") throw new Error("Marker click listener was not registered");

    click();

    const surface = mapMocks.floatPane.querySelector<HTMLElement>(".catalog-map-popup");
    expect(surface).not.toBeNull();
    expect(surface).toHaveAttribute("aria-label", "Soda Shop details");
    expect(surface).toHaveTextContent("Soda Shop");
    const popupContainer = mapMocks.floatPane.querySelector<HTMLElement>(
      ".catalog-map-popup__container",
    );
    expect(mapMocks.preventMapHitsAndGesturesFrom).toHaveBeenCalledWith(popupContainer);
    expect(popupContainer?.style.left).toBe("120px");
    within(mapMocks.floatPane).getByRole("button", { name: "Close location details" }).click();
    expect(mapMocks.floatPane).toBeEmptyDOMElement();
  });

  it("associates each catalog filter label with its form input", async () => {
    render(<SodaCatalog parameters={new URLSearchParams()} loader={loader} />);

    await screen.findByRole("heading", { name: "Soda varieties" });
    const labels = document.querySelectorAll<HTMLLabelElement>('label[for^="catalog-"]');
    expect(labels).toHaveLength(8);
    for (const label of labels) {
      expect(document.getElementById(label.htmlFor)).toBeInstanceOf(HTMLInputElement);
    }
  });

  it("fits once and keeps the map instance after an idle center update", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubEnv("VITE_GOOGLE_MAPS_MAP_ID", "test-map-id");
    const parameters = new URLSearchParams({ view: "map" });
    const mapLoader = vi.fn().mockResolvedValue({
      locations: [
        {
          id: "shop",
          name: "Soda Shop",
          address: { street: "1 Main St", city: "Indy", state: "IN", postalCode: "46204" },
          geo: { lat: 39.77, lng: -86.16 },
          geohash: "dp4dpr",
        },
      ],
      items: [
        {
          id: "sprecher-root",
          brand: "Sprecher",
          name: "Root Beer",
          flavor: "Root Beer",
          ratingCount: 0,
          tried: false,
          availability: [
            {
              id: "available",
              locationId: "shop",
              sodaId: "sprecher-root",
              form: "draft",
              canSample: "yes",
              canPurchase: "yes",
            },
          ],
        },
      ],
    });
    const onCenterChange = vi.fn();
    const { rerender } = render(
      <SodaCatalog parameters={parameters} loader={mapLoader} onCenterChange={onCenterChange} />,
    );
    await waitFor(() => expect(mapMocks.mapConstructor).toHaveBeenCalledTimes(1));
    expect(mapMocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(mapMocks.mapConstructor).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        colorScheme: "FOLLOW_SYSTEM",
        mapId: "test-map-id",
        zoom: 8,
      }),
    );

    mapMocks.getCenter.mockReturnValue({ lat: () => 39.78, lng: () => -86.17 });
    const idleHandler = mapMocks.addListener.mock.calls.find(([event]) => event === "idle")?.[1];
    if (typeof idleHandler !== "function") throw new Error("Map idle listener was not registered");
    idleHandler();
    expect(onCenterChange).toHaveBeenCalledWith({ lat: 39.78, lng: -86.17 });

    rerender(
      <SodaCatalog
        parameters={parameters}
        center={{ lat: 39.78, lng: -86.17 }}
        loader={mapLoader}
        onCenterChange={onCenterChange}
      />,
    );

    await waitFor(() =>
      expect(mapMocks.setCenter).toHaveBeenCalledWith({ lat: 39.78, lng: -86.17 }),
    );
    expect(mapMocks.mapConstructor).toHaveBeenCalledTimes(1);
    expect(mapMocks.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("disables and ignores personal tried filtering for guests", async () => {
    render(
      <SodaCatalog parameters={new URLSearchParams({ tried: "not-tried" })} loader={loader} />,
    );
    expect(await screen.findByText("2 matching soda varieties")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Tried" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
