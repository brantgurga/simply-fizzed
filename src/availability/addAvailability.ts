import { doc, type Firestore, runTransaction, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, type Availability, type SodaForm } from "../model/firestore";
import { parseSoda } from "../soda/sodas";

export interface AvailabilityContributor {
  id: string;
  name?: string;
}

export class DuplicateAvailabilityError extends Error {
  constructor() {
    super("That soda and form are already listed at this location.");
    this.name = "DuplicateAvailabilityError";
  }
}

/** Build the canonical ID enforced by Firestore rules for one exact availability tuple. */
export function availabilityDocumentId(locationId: string, sodaId: string, form: SodaForm): string {
  if (locationId.includes("$") || sodaId.includes("$")) {
    throw new Error("Catalog and location IDs cannot contain '$'.");
  }
  return `${locationId}$${sodaId}$${form}`;
}

export async function addAvailability(
  db: Firestore,
  locationId: string,
  sodaId: string,
  form: SodaForm,
  contributor: AvailabilityContributor,
): Promise<Availability> {
  const locationRef = doc(db, COLLECTIONS.locations, locationId);
  const sodaRef = doc(db, COLLECTIONS.sodas, sodaId);
  const availabilityRef = doc(
    db,
    COLLECTIONS.availability,
    availabilityDocumentId(locationId, sodaId, form),
  );

  return runTransaction(db, async (transaction) => {
    const [locationSnapshot, sodaSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(locationRef),
      transaction.get(sodaRef),
      transaction.get(availabilityRef),
    ]);
    if (!locationSnapshot.exists()) throw new Error("The location no longer exists.");
    if (!sodaSnapshot.exists()) throw new Error("The selected soda no longer exists.");
    const soda = parseSoda(sodaSnapshot.id, sodaSnapshot.data());
    if (soda === undefined) throw new Error("The selected soda is malformed.");
    if (existingSnapshot.exists()) throw new DuplicateAvailabilityError();

    const availability: Availability = {
      locationId,
      sodaId,
      form,
      sodaName: soda.name,
      sodaBrand: soda.brand,
      sodaFlavor: soda.flavor,
      createdBy: contributor.id,
      createdByName: contributor.name?.trim() || "",
      updatedBy: contributor.id,
      updatedByName: contributor.name?.trim() || "",
    };
    const timestamp = serverTimestamp();
    transaction.set(availabilityRef, {
      ...availability,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return availability;
  });
}
