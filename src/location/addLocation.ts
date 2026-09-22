import { addDoc, collection, type Firestore, serverTimestamp } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";
import { COLLECTIONS } from "../model/firestore";
import type { Geocoder } from "./geocoder";

export interface NewLocationInput {
  name: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface LocationContributor {
  id: string;
  name?: string;
}

export async function addLocation(
  db: Firestore,
  geocoder: Geocoder,
  contributor: LocationContributor,
  input: NewLocationInput,
): Promise<void> {
  const address = {
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    postalCode: input.postalCode.trim(),
  };
  const geo = await geocoder.geocode(
    `${address.street}, ${address.city}, ${address.state} ${address.postalCode}`,
  );

  const timestamp = serverTimestamp();
  const contributorName = contributor.name?.trim() || "";

  await addDoc(collection(db, COLLECTIONS.locations), {
    name: input.name.trim(),
    address,
    geo,
    geohash: geohashForLocation([geo.lat, geo.lng]),
    createdBy: contributor.id,
    createdByName: contributorName,
    createdAt: timestamp,
    updatedBy: contributor.id,
    updatedByName: contributorName,
    updatedAt: timestamp,
  });
}
