import {
  collection,
  doc,
  type Firestore,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  type Availability,
  availabilityWriteSchema,
  canonicalSodaSchema,
  COLLECTIONS,
  type Soda,
  sodaWriteSchema,
  type SodaForm,
} from "../model/firestore";
import { isAvailabilityReferenceId, parseSoda, type SodaDocument } from "../soda/sodas";

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

export interface NewSodaAvailability {
  availability: Availability;
  soda: SodaDocument;
}

function canonicalSoda(soda: Soda): Soda {
  const parsed = canonicalSodaSchema.safeParse({
    brand: soda.brand.trim(),
    name: soda.name.trim(),
    flavor: soda.flavor.trim(),
  });
  if (!parsed.success) {
    throw new Error("Brand, name, and flavor must each be between 1 and 200 characters.");
  }
  return parsed.data;
}

function availabilityData(
  locationId: string,
  sodaId: string,
  soda: Soda,
  form: SodaForm,
  contributor: AvailabilityContributor,
): Availability {
  const contributorName = contributor.name?.trim() || "";
  return availabilityWriteSchema.parse({
    locationId,
    sodaId,
    form,
    sodaName: soda.name,
    sodaBrand: soda.brand,
    sodaFlavor: soda.flavor,
    createdBy: contributor.id,
    createdByName: contributorName,
    updatedBy: contributor.id,
    updatedByName: contributorName,
  });
}

/** Build the canonical ID enforced by Firestore rules for one exact availability tuple. */
export function availabilityDocumentId(locationId: string, sodaId: string, form: SodaForm): string {
  if (!isAvailabilityReferenceId(locationId) || !isAvailabilityReferenceId(sodaId)) {
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

    const availability = availabilityData(locationId, sodaId, soda, form, contributor);
    const timestamp = serverTimestamp();
    transaction.set(availabilityRef, {
      ...availability,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return availability;
  });
}

/** Atomically add a new catalog soda and its first availability record. */
export async function addNewSodaAvailability(
  db: Firestore,
  locationId: string,
  sodaInput: Soda,
  form: SodaForm,
  contributor: AvailabilityContributor,
): Promise<NewSodaAvailability> {
  const soda = canonicalSoda(sodaInput);
  const sodaRef = doc(collection(db, COLLECTIONS.sodas));
  const availabilityId = availabilityDocumentId(locationId, sodaRef.id, form);
  const availabilityRef = doc(db, COLLECTIONS.availability, availabilityId);
  const locationRef = doc(db, COLLECTIONS.locations, locationId);

  return runTransaction(db, async (transaction) => {
    const [locationSnapshot, sodaSnapshot, existingSnapshot] = await Promise.all([
      transaction.get(locationRef),
      transaction.get(sodaRef),
      transaction.get(availabilityRef),
    ]);
    if (!locationSnapshot.exists()) throw new Error("The location no longer exists.");
    if (sodaSnapshot.exists()) throw new Error("The new soda ID is already in use.");
    if (existingSnapshot.exists()) throw new DuplicateAvailabilityError();

    const contributorName = contributor.name?.trim() || "";
    const sodaWrite = sodaWriteSchema.parse({
      ...soda,
      initialAvailabilityId: availabilityId,
      createdBy: contributor.id,
      createdByName: contributorName,
      updatedBy: contributor.id,
      updatedByName: contributorName,
    });
    const availability = availabilityData(locationId, sodaRef.id, soda, form, contributor);
    const timestamp = serverTimestamp();
    transaction.set(sodaRef, {
      ...sodaWrite,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.set(availabilityRef, {
      ...availability,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return { availability, soda: { id: sodaRef.id, ...soda } };
  });
}
