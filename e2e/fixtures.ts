// Deterministic seed data for the end-to-end tests. Both the Playwright
// globalSetup (which writes these documents into the Firestore emulator) and the
// specs (which assert on them) import from here so the seeded data and the
// expectations can never drift apart. The document shapes mirror the app's
// Firestore model in `src/model/firestore.ts`; they are re-declared locally
// rather than imported so the e2e TypeScript project stays independent of the
// app project.
import { geohashForLocation } from "geofire-common";

/** A latitude/longitude coordinate the browser will report for the test run. */
export interface Geolocation {
  latitude: number;
  longitude: number;
}

/** The physical form a soda is sold in at a location. */
export type SodaForm = "draft" | "can" | "bottle";

/** A seed `locations/{id}` document (geohash is derived on write). */
export interface SeedLocation {
  id: string;
  name: string;
  address: { street: string; city: string; state: string; postalCode: string };
  geo: { lat: number; lng: number };
}

/** A seed `sodas/{id}` document. */
export interface SeedSoda {
  id: string;
  name: string;
  brand: string;
  flavor: string;
  aliases?: string[];
}

/** A seed `availability/{id}` document joining a soda to a location. */
export interface SeedAvailability {
  id: string;
  locationId: string;
  sodaId: string;
  form: SodaForm;
  sodaName: string;
  sodaBrand: string;
  sodaFlavor: string;
}

// Browser geolocation granted for the test: downtown Indianapolis. Kroger sits
// at this point (~0 miles) and Tim's Brewery is ~14 miles north in Carmel, so
// both fall inside the 60-mile radius and results have a stable near->far order.
export const INDIANAPOLIS: Geolocation = { latitude: 39.7684, longitude: -86.1581 };

export const KROGER: SeedLocation = {
  id: "kroger-indianapolis",
  name: "Kroger",
  address: { street: "227 W Michigan St", city: "Indianapolis", state: "IN", postalCode: "46204" },
  geo: { lat: 39.7684, lng: -86.1581 },
};

export const TIMS_BREWERY: SeedLocation = {
  id: "tims-brewery",
  name: "Tim's Brewery",
  address: { street: "40 W Main St", city: "Carmel", state: "IN", postalCode: "46032" },
  geo: { lat: 39.9784, lng: -86.118 },
};

export const LOCATIONS: readonly SeedLocation[] = [KROGER, TIMS_BREWERY];

export const SODAS: readonly SeedSoda[] = [
  { id: "big-k-root-beer", name: "Root Beer", brand: "Big K", flavor: "root beer" },
  {
    id: "coca-cola",
    name: "Cola",
    brand: "Coca-Cola",
    flavor: "Original",
    aliases: ["Coke", "Coca Cola"],
  },
  {
    id: "pepsi-cola",
    name: "Cola",
    brand: "Pepsi-Cola",
    flavor: "Original",
    aliases: ["Coke", "Pepsi"],
  },
  { id: "tims-root-beer", name: "Root Beer", brand: "Tim's", flavor: "root beer" },
];

export const AVAILABILITY: readonly SeedAvailability[] = [
  {
    id: `${KROGER.id}$big-k-root-beer$can`,
    locationId: KROGER.id,
    sodaId: "big-k-root-beer",
    form: "can",
    sodaName: "Root Beer",
    sodaBrand: "Big K",
    sodaFlavor: "root beer",
  },
  {
    id: `${KROGER.id}$coca-cola$can`,
    locationId: KROGER.id,
    sodaId: "coca-cola",
    form: "can",
    sodaName: "Cola",
    sodaBrand: "Coca-Cola",
    sodaFlavor: "Original",
  },
  {
    id: `${TIMS_BREWERY.id}$tims-root-beer$draft`,
    locationId: TIMS_BREWERY.id,
    sodaId: "tims-root-beer",
    form: "draft",
    sodaName: "Root Beer",
    sodaBrand: "Tim's",
    sodaFlavor: "root beer",
  },
];

/** Derive the geohash a location document is stored with, matching the app. */
export function geohashFor(location: SeedLocation): string {
  return geohashForLocation([location.geo.lat, location.geo.lng]);
}
