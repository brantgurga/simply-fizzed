// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import type { GeoPoint } from "../model/firestore";
import type { LocationDoc } from "../nearby/distance";
import { db } from "../firebase";
import { loadGoogleMapsApi } from "../location/geocoder";
import { locationRoute, sodaCatalogRoute, sodaRoute } from "../routes";
import {
  catalogResultLocations,
  filterSodaCatalog,
  loadSodaCatalogData,
  matchesCatalogAvailability,
  type SodaCatalogData,
  type SodaCatalogFilters,
  type SodaCatalogItem,
} from "./catalog";

const PAGE_SIZE = 24;
const DEFAULT_FILTERS: SodaCatalogFilters = {
  search: "",
  brand: "",
  flavor: "",
  minimumRating: 0,
  tried: "all",
  form: "",
  canSample: "",
  canPurchase: "",
  sort: "name",
};

type View = "list" | "map";
type CatalogLoader = (userId?: string) => Promise<SodaCatalogData>;
const defaultCatalogLoader: CatalogLoader = (userId) => loadSodaCatalogData(db, userId);
const ignoreCenterChange = () => undefined;

function parseState(parameters: URLSearchParams) {
  const minimumRating = Number(parameters.get("rating") ?? 0);
  const tried = parameters.get("tried");
  const form = parameters.get("form");
  const sample = parameters.get("sample");
  const purchase = parameters.get("purchase");
  const sort = parameters.get("sort");
  return {
    filters: {
      search: parameters.get("q") ?? "",
      brand: parameters.get("brand") ?? "",
      flavor: parameters.get("flavor") ?? "",
      minimumRating: Number.isFinite(minimumRating) ? minimumRating : 0,
      tried: tried === "tried" || tried === "not-tried" ? tried : "all",
      form: form === "draft" || form === "can" || form === "bottle" ? form : "",
      canSample: sample === "yes" || sample === "no" || sample === "unknown" ? sample : "",
      canPurchase:
        purchase === "yes" || purchase === "no" || purchase === "unknown" ? purchase : "",
      sort: sort === "brand" || sort === "flavor" || sort === "rating" ? sort : "name",
    } satisfies SodaCatalogFilters,
    page: Math.max(1, Number(parameters.get("page") ?? 1) || 1),
    view: parameters.get("view") === "map" ? ("map" as const) : ("list" as const),
  };
}

function updateRoute(
  filters: SodaCatalogFilters,
  page: number,
  view: View,
  mode: "push" | "replace" = "push",
) {
  const parameters = new URLSearchParams();
  if (filters.search) parameters.set("q", filters.search);
  if (filters.brand) parameters.set("brand", filters.brand);
  if (filters.flavor) parameters.set("flavor", filters.flavor);
  if (filters.minimumRating) parameters.set("rating", String(filters.minimumRating));
  if (filters.tried !== "all") parameters.set("tried", filters.tried);
  if (filters.form) parameters.set("form", filters.form);
  if (filters.canSample) parameters.set("sample", filters.canSample);
  if (filters.canPurchase) parameters.set("purchase", filters.canPurchase);
  if (filters.sort !== "name") parameters.set("sort", filters.sort);
  if (page > 1) parameters.set("page", String(page));
  if (view === "map") parameters.set("view", view);
  const url = sodaCatalogRoute(parameters);
  if (mode === "replace") {
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else window.location.hash = url.slice(1);
}

type CoreLibrary = {
  ColorScheme: typeof google.maps.ColorScheme;
  LatLngBounds: new () => google.maps.LatLngBounds;
};
type MapsLibrary = {
  Map: new (element: HTMLElement, options: google.maps.MapOptions) => google.maps.Map;
  OverlayView: typeof google.maps.OverlayView;
};
type MarkerLibrary = {
  AdvancedMarkerElement: new (
    options: google.maps.marker.AdvancedMarkerElementOptions,
  ) => google.maps.marker.AdvancedMarkerElement;
};

function hasConstructor(value: unknown, property: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    property in value &&
    typeof Reflect.get(value, property) === "function"
  );
}

function isCoreLibrary(value: unknown): value is CoreLibrary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "ColorScheme") === "object" &&
    hasConstructor(value, "LatLngBounds")
  );
}

function isMapsLibrary(value: unknown): value is MapsLibrary {
  return hasConstructor(value, "Map") && hasConstructor(value, "OverlayView");
}

function isMarkerLibrary(value: unknown): value is MarkerLibrary {
  return hasConstructor(value, "AdvancedMarkerElement");
}

function createCatalogPopup(
  OverlayView: typeof google.maps.OverlayView,
  position: google.maps.LatLngLiteral,
  content: HTMLElement,
  label: string,
): google.maps.OverlayView {
  class CatalogPopup extends OverlayView {
    readonly container = document.createElement("div");

    constructor() {
      super();
      this.container.className = "catalog-map-popup__container";
      const anchor = document.createElement("div");
      anchor.className = "catalog-map-popup__anchor";
      const popup = document.createElement("section");
      popup.className = "catalog-map-popup";
      popup.setAttribute("aria-label", label);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "catalog-map-popup__close";
      close.setAttribute("aria-label", "Close location details");
      close.textContent = "×";
      close.addEventListener("click", () => this.setMap(null));
      this.container.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.setMap(null);
      });

      popup.append(close, content);
      anchor.append(popup);
      this.container.append(anchor);
      CatalogPopup.preventMapHitsAndGesturesFrom(this.container);
    }

    override onAdd() {
      this.getPanes()?.floatPane.append(this.container);
      this.container.querySelector<HTMLButtonElement>("button")?.focus();
    }

    override onRemove() {
      this.container.remove();
    }

    override draw() {
      const point = this.getProjection().fromLatLngToDivPixel(position);
      if (point === null) return;
      const visible = Math.abs(point.x) < 4000 && Math.abs(point.y) < 4000;
      this.container.style.display = visible ? "block" : "none";
      if (visible) {
        this.container.style.left = `${point.x}px`;
        this.container.style.top = `${point.y}px`;
      }
    }
  }

  return new CatalogPopup();
}

function markerDetails(
  location: LocationDoc,
  items: readonly SodaCatalogItem[],
  filters: SodaCatalogFilters,
): HTMLElement {
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  const locationLink = document.createElement("a");
  locationLink.href = locationRoute(location.id);
  locationLink.textContent = location.name;
  heading.append(locationLink);
  content.append(heading);

  const list = document.createElement("ul");
  for (const item of items) {
    for (const availability of item.availability) {
      if (
        availability.locationId !== location.id ||
        !matchesCatalogAvailability(availability, filters)
      ) {
        continue;
      }
      const listItem = document.createElement("li");
      const sodaLink = document.createElement("a");
      sodaLink.href = sodaRoute(item.id);
      sodaLink.textContent = `${item.brand} ${item.name} — ${availability.form}`;
      listItem.append(sodaLink);
      if (availability.updatedAt !== undefined || availability.updatedByName !== undefined) {
        const provenance = document.createElement("small");
        const updated = availability.updatedAt?.toLocaleDateString() ?? "unknown date";
        provenance.textContent = ` — updated ${updated} by ${availability.updatedByName ?? "unknown"}`;
        listItem.append(provenance);
      }
      list.append(listItem);
    }
  }
  content.append(list);
  return content;
}

interface CatalogMapProps {
  locations: readonly LocationDoc[];
  items: readonly SodaCatalogItem[];
  filters: SodaCatalogFilters;
  center?: GeoPoint | undefined;
  onCenterChange: (center: GeoPoint) => void;
}

function CatalogMap({ locations, items, filters, center, onCenterChange }: CatalogMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapReference = useRef<google.maps.Map | undefined>(undefined);
  const centerReference = useRef(center);
  const onCenterChangeReference = useRef(onCenterChange);
  const [error, setError] = useState(false);

  useEffect(() => {
    centerReference.current = center;
  }, [center]);

  useEffect(() => {
    onCenterChangeReference.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    if (container.current === null || locations.length === 0) return () => undefined;
    if (import.meta.env.VITE_GOOGLE_MAPS_API_KEY.startsWith("demo-")) return () => undefined;
    let active = true;
    let clusterer: MarkerClusterer | undefined;
    let closePopup: () => void = () => undefined;
    const element = container.current;
    void (async () => {
      try {
        const api = await loadGoogleMapsApi();
        const [coreLibrary, mapsLibrary, markerLibrary] = await Promise.all([
          api.maps.importLibrary("core"),
          api.maps.importLibrary("maps"),
          api.maps.importLibrary("marker"),
        ]);
        if (!active) return;
        if (
          !isCoreLibrary(coreLibrary) ||
          !isMapsLibrary(mapsLibrary) ||
          !isMarkerLibrary(markerLibrary)
        ) {
          throw new Error("Google Maps returned an incomplete map library");
        }
        const fallback = locations[0]?.geo ?? { lat: 39.0997, lng: -94.5786 };
        const initialCenter = centerReference.current;
        const map = new mapsLibrary.Map(element, {
          center: initialCenter ?? fallback,
          colorScheme: coreLibrary.ColorScheme.FOLLOW_SYSTEM,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
          zoom: 8,
        });
        mapReference.current = map;
        let popup: google.maps.OverlayView | undefined;
        closePopup = () => popup?.setMap(null);
        const markers = locations.map((location) => {
          const marker = new markerLibrary.AdvancedMarkerElement({
            position: location.geo,
            title: location.name,
          });
          marker.addListener("click", () => {
            popup?.setMap(null);
            popup = createCatalogPopup(
              mapsLibrary.OverlayView,
              location.geo,
              markerDetails(location, items, filters),
              `${location.name} details`,
            );
            popup.setMap(map);
          });
          return marker;
        });
        clusterer = new MarkerClusterer({ map, markers });
        if (initialCenter === undefined) {
          const bounds = new coreLibrary.LatLngBounds();
          for (const location of locations) bounds.extend(location.geo);
          map.fitBounds(bounds);
        }
        map.addListener("idle", () => {
          const nextCenter = map.getCenter();
          const lat = nextCenter?.lat();
          const lng = nextCenter?.lng();
          if (typeof lat === "number" && typeof lng === "number") {
            onCenterChangeReference.current({ lat, lng });
          }
        });
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
      closePopup();
      clusterer?.clearMarkers();
      clusterer?.setMap(null);
      mapReference.current = undefined;
      element.replaceChildren();
    };
  }, [filters, items, locations]);

  useEffect(() => {
    if (center !== undefined) mapReference.current?.setCenter(center);
  }, [center]);

  if (locations.length === 0) return <Alert severity="info">No matching locations to map.</Alert>;
  if (error) return <Alert severity="error">The map could not be loaded.</Alert>;
  if (import.meta.env.VITE_GOOGLE_MAPS_API_KEY.startsWith("demo-")) {
    return (
      <Stack spacing={1} aria-label="Matching map locations">
        <Alert severity="info">Interactive maps are disabled in the local demo environment.</Alert>
        {locations.map((location) => (
          <Button
            key={location.id}
            href={locationRoute(location.id)}
            sx={{ alignSelf: "flex-start" }}
          >
            {location.name}
          </Button>
        ))}
      </Stack>
    );
  }
  return <Box ref={container} aria-label="Map of matching soda locations" sx={{ height: 480 }} />;
}

export interface SodaCatalogProps {
  parameters: URLSearchParams;
  userId?: string | undefined;
  center?: GeoPoint | undefined;
  onCenterChange?: (center: GeoPoint) => void;
  loader?: CatalogLoader;
}

export default function SodaCatalog({
  parameters,
  userId,
  center,
  onCenterChange = ignoreCenterChange,
  loader = defaultCatalogLoader,
}: SodaCatalogProps) {
  const { filters, page, view } = useMemo(() => {
    const state = parseState(parameters);
    if (userId === undefined) state.filters.tried = "all";
    return state;
  }, [parameters, userId]);
  const [loadState, setLoadState] = useState<{
    loader: CatalogLoader;
    userId?: string | undefined;
    status: "loading" | "failed" | "ready";
    data?: SodaCatalogData;
  }>({ loader, userId, status: "loading" });
  if (loadState.loader !== loader || loadState.userId !== userId) {
    setLoadState({ loader, userId, status: "loading" });
  }

  useEffect(() => {
    let active = true;
    void loader(userId)
      .then((loaded) => {
        if (active) setLoadState({ loader, userId, status: "ready", data: loaded });
      })
      .catch(() => {
        if (active) setLoadState({ loader, userId, status: "failed" });
      });
    return () => {
      active = false;
    };
  }, [loader, userId]);

  const data = loadState.data;
  const matches = useMemo(
    () => (data === undefined ? [] : filterSodaCatalog(data.items, filters)),
    [data, filters],
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const mapLocations = useMemo(
    () => (data === undefined ? [] : catalogResultLocations(matches, data.locations, filters)),
    [data, filters, matches],
  );
  const brands = [...new Set(data?.items.map((item) => item.brand) ?? [])].toSorted();
  const flavors = [...new Set(data?.items.map((item) => item.flavor) ?? [])].toSorted();

  const changeFilters = (next: SodaCatalogFilters) => updateRoute(next, 1, view, "replace");
  const setFilter = <Key extends keyof SodaCatalogFilters>(
    key: Key,
    value: SodaCatalogFilters[Key],
  ) => changeFilters({ ...filters, [key]: value });

  if (loadState.status === "failed") {
    return <Alert severity="error">The soda catalog could not be loaded.</Alert>;
  }
  if (data === undefined) return <CircularProgress aria-label="Loading soda catalog" />;

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h2">
          Soda varieties
        </Typography>
        <Typography color="text.secondary">
          Search, compare ratings, and find where each soda is available.
        </Typography>
      </Stack>
      <TextField
        label="Search brand, name, or flavor"
        value={filters.search}
        onChange={(event) => setFilter("search", event.target.value)}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 2,
        }}
      >
        <FormControl>
          <InputLabel id="catalog-brand-label" htmlFor="catalog-brand-input">
            Brand
          </InputLabel>
          <Select
            id="catalog-brand-select"
            labelId="catalog-brand-label"
            inputProps={{ id: "catalog-brand-input" }}
            label="Brand"
            value={filters.brand}
            onChange={(event) => setFilter("brand", event.target.value)}
          >
            <MenuItem value="">All brands</MenuItem>
            {brands.map((brand) => (
              <MenuItem key={brand} value={brand}>
                {brand}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-flavor-label" htmlFor="catalog-flavor-input">
            Flavor
          </InputLabel>
          <Select
            id="catalog-flavor-select"
            labelId="catalog-flavor-label"
            inputProps={{ id: "catalog-flavor-input" }}
            label="Flavor"
            value={filters.flavor}
            onChange={(event) => setFilter("flavor", event.target.value)}
          >
            <MenuItem value="">All flavors</MenuItem>
            {flavors.map((flavor) => (
              <MenuItem key={flavor} value={flavor}>
                {flavor}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-rating-label" htmlFor="catalog-rating-input">
            Minimum rating
          </InputLabel>
          <Select
            id="catalog-rating-select"
            labelId="catalog-rating-label"
            inputProps={{ id: "catalog-rating-input" }}
            label="Minimum rating"
            value={filters.minimumRating}
            onChange={(event) => setFilter("minimumRating", event.target.value)}
          >
            <MenuItem value={0}>Any rating</MenuItem>
            {[1, 2, 3, 4, 5].map((rating) => (
              <MenuItem key={rating} value={rating}>
                {rating}+ mugs
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-tried-label" htmlFor="catalog-tried-input">
            Tried
          </InputLabel>
          <Select
            id="catalog-tried-select"
            labelId="catalog-tried-label"
            inputProps={{ id: "catalog-tried-input" }}
            label="Tried"
            value={filters.tried}
            disabled={userId === undefined}
            onChange={(event) => setFilter("tried", event.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="tried">Tried</MenuItem>
            <MenuItem value="not-tried">Not tried</MenuItem>
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-form-label" htmlFor="catalog-form-input">
            Form
          </InputLabel>
          <Select
            id="catalog-form-select"
            labelId="catalog-form-label"
            inputProps={{ id: "catalog-form-input" }}
            label="Form"
            value={filters.form}
            onChange={(event) =>
              setFilter("form", event.target.value as SodaCatalogFilters["form"])
            }
          >
            <MenuItem value="">Any form</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="can">Can</MenuItem>
            <MenuItem value="bottle">Bottle</MenuItem>
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-sampling-label" htmlFor="catalog-sampling-input">
            Sampling
          </InputLabel>
          <Select
            id="catalog-sampling-select"
            labelId="catalog-sampling-label"
            inputProps={{ id: "catalog-sampling-input" }}
            label="Sampling"
            value={filters.canSample}
            onChange={(event) =>
              setFilter("canSample", event.target.value as SodaCatalogFilters["canSample"])
            }
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="yes">Can sample</MenuItem>
            <MenuItem value="no">Cannot sample</MenuItem>
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-purchase-label" htmlFor="catalog-purchase-input">
            Purchase
          </InputLabel>
          <Select
            id="catalog-purchase-select"
            labelId="catalog-purchase-label"
            inputProps={{ id: "catalog-purchase-input" }}
            label="Purchase"
            value={filters.canPurchase}
            onChange={(event) =>
              setFilter("canPurchase", event.target.value as SodaCatalogFilters["canPurchase"])
            }
          >
            <MenuItem value="">Any</MenuItem>
            <MenuItem value="yes">Can purchase</MenuItem>
            <MenuItem value="no">Cannot purchase</MenuItem>
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel id="catalog-sort-label" htmlFor="catalog-sort-input">
            Sort
          </InputLabel>
          <Select
            id="catalog-sort-select"
            labelId="catalog-sort-label"
            inputProps={{ id: "catalog-sort-input" }}
            label="Sort"
            value={filters.sort}
            onChange={(event) => setFilter("sort", event.target.value)}
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="brand">Brand</MenuItem>
            <MenuItem value="flavor">Flavor</MenuItem>
            <MenuItem value="rating">Rating</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography>
          {matches.length} matching soda {matches.length === 1 ? "variety" : "varieties"}
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={view}
          onChange={(_event, next: View | null) => {
            if (next !== null) updateRoute(filters, page, next);
          }}
          size="small"
          aria-label="Catalog presentation"
        >
          <ToggleButton value="list">List</ToggleButton>
          <ToggleButton value="map">Map</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {view === "map" ? (
        <CatalogMap
          locations={mapLocations}
          items={matches}
          filters={filters}
          center={center}
          onCenterChange={onCenterChange}
        />
      ) : pageItems.length === 0 ? (
        <Alert severity="info">No soda varieties match these filters.</Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
            gap: 2,
          }}
        >
          {pageItems.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea href={sodaRoute(item.id)} sx={{ height: "100%" }}>
                <CardContent>
                  <Stack spacing={0.5}>
                    <Typography variant="overline">{item.brand}</Typography>
                    <Typography variant="h6">{item.name}</Typography>
                    <Typography color="text.secondary">{item.flavor}</Typography>
                    <Typography>
                      {item.averageRating === undefined
                        ? "Not yet rated"
                        : `${item.averageRating.toFixed(1)} mugs (${item.ratingCount} ${item.ratingCount === 1 ? "rating" : "ratings"})`}
                    </Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
      {view === "list" && pageCount > 1 && (
        <Pagination
          count={pageCount}
          page={currentPage}
          onChange={(_event, nextPage) => updateRoute(filters, nextPage, view)}
          showFirstButton
          showLastButton
        />
      )}
      <Button
        variant="text"
        onClick={() => updateRoute(DEFAULT_FILTERS, 1, "list", "replace")}
        sx={{ alignSelf: "flex-start" }}
      >
        Clear catalog filters
      </Button>
    </Stack>
  );
}
