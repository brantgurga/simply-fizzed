import type { GeoPoint } from "../model/firestore";

const STORAGE_KEY = "simply-fizzed:last-search-center";
type SearchStorage = Pick<Storage, "getItem" | "setItem">;

function getStorage(storage?: SearchStorage): SearchStorage | undefined {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== "object" || value === null) return false;
  if (!("lat" in value) || !("lng" in value)) return false;

  const { lat, lng } = value;
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

export function loadLastSearchCenter(storage?: SearchStorage): GeoPoint | undefined {
  try {
    const saved = getStorage(storage)?.getItem(STORAGE_KEY);
    if (saved === null || saved === undefined) return undefined;

    const parsed: unknown = JSON.parse(saved);
    return isGeoPoint(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveLastSearchCenter(center: GeoPoint, storage?: SearchStorage): void {
  if (!isGeoPoint(center)) return;

  try {
    getStorage(storage)?.setItem(STORAGE_KEY, JSON.stringify(center));
  } catch {
    // Search still works when storage is unavailable or full.
  }
}
