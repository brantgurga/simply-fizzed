import {
  collection,
  doc,
  type Firestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  type Availability,
  type AvailabilityValue,
  availabilityUpdateWriteSchema,
  availabilityWriteSchema,
  canonicalSodaSchema,
  COLLECTIONS,
  type Soda,
  sodaWriteSchema,
  type SodaForm,
} from "../model/firestore";
import { isAvailabilityReferenceId, type SodaDocument } from "../soda/sodas";

export interface AvailabilityContributor {
  id: string;
  name?: string;
}

export interface AvailabilityDetails {
  canSample: AvailabilityValue;
  canPurchase: AvailabilityValue;
}

export interface QueuedWrite<T> {
  value: T;
  committed: Promise<void>;
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

/** Returns trimmed public attribution, or an empty string when no name is available. */
function contributorName(contributor: AvailabilityContributor): string {
  return contributor.name?.trim() || "";
}

function availabilityData(
  locationId: string,
  soda: SodaDocument,
  form: SodaForm,
  details: AvailabilityDetails,
  contributor: AvailabilityContributor,
  actionTime: Date,
): Availability {
  const data = availabilityWriteSchema.parse({
    locationId,
    sodaId: soda.id,
    form,
    sodaName: soda.name,
    sodaBrand: soda.brand,
    sodaFlavor: soda.flavor,
    ...details,
    createdBy: contributor.id,
    createdByName: contributorName(contributor),
    updatedBy: contributor.id,
    updatedByName: contributorName(contributor),
  });
  return { ...data, createdAt: actionTime, updatedAt: actionTime };
}

/** Build the canonical ID enforced by Firestore rules for one exact availability tuple. */
export function availabilityDocumentId(locationId: string, sodaId: string, form: SodaForm): string {
  if (!isAvailabilityReferenceId(locationId) || !isAvailabilityReferenceId(sodaId)) {
    throw new Error("Catalog and location IDs cannot contain '$'.");
  }
  return `${locationId}$${sodaId}$${form}`;
}

/** Queue an existing catalog soda for addition, including while offline. */
export function addAvailability(
  db: Firestore,
  locationId: string,
  soda: SodaDocument,
  form: SodaForm,
  details: AvailabilityDetails,
  contributor: AvailabilityContributor,
  actionTime = new Date(),
): QueuedWrite<Availability> {
  const availability = availabilityData(locationId, soda, form, details, contributor, actionTime);
  const reference = doc(
    db,
    COLLECTIONS.availability,
    availabilityDocumentId(locationId, soda.id, form),
  );
  const timestamp = Timestamp.fromDate(actionTime);
  return {
    value: availability,
    committed: setDoc(reference, {
      ...availability,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  };
}

/** Atomically queue a new catalog soda and its first availability, including while offline. */
export function addNewSodaAvailability(
  db: Firestore,
  locationId: string,
  sodaInput: Soda,
  form: SodaForm,
  details: AvailabilityDetails,
  contributor: AvailabilityContributor,
  actionTime = new Date(),
): QueuedWrite<NewSodaAvailability> {
  const soda = canonicalSoda(sodaInput);
  const sodaReference = doc(collection(db, COLLECTIONS.sodas));
  const sodaDocument: SodaDocument = { id: sodaReference.id, ...soda };
  const availabilityId = availabilityDocumentId(locationId, sodaReference.id, form);
  const availability = availabilityData(
    locationId,
    sodaDocument,
    form,
    details,
    contributor,
    actionTime,
  );
  const name = contributorName(contributor);
  const sodaWrite = sodaWriteSchema.parse({
    ...soda,
    initialAvailabilityId: availabilityId,
    createdBy: contributor.id,
    createdByName: name,
    updatedBy: contributor.id,
    updatedByName: name,
  });
  const actionTimestamp = Timestamp.fromDate(actionTime);
  const serverTime = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(sodaReference, { ...sodaWrite, createdAt: serverTime, updatedAt: serverTime });
  batch.set(doc(db, COLLECTIONS.availability, availabilityId), {
    ...availability,
    createdAt: actionTimestamp,
    updatedAt: actionTimestamp,
  });
  return {
    value: { availability, soda: sodaDocument },
    committed: batch.commit(),
  };
}

/**
 * Queues an attributed availability detail edit using the user's action time.
 *
 * The returned value is suitable for optimistic display. Await `committed` to know when Firestore
 * has accepted the offline-capable write.
 *
 * @throws When details, attribution, the action time, or a derived document ID is invalid.
 */
export function updateAvailabilityDetails(
  db: Firestore,
  availability: Availability,
  details: AvailabilityDetails,
  contributor: AvailabilityContributor,
  actionTime = new Date(),
): QueuedWrite<Availability> {
  const update = availabilityUpdateWriteSchema.parse({
    ...details,
    updatedBy: contributor.id,
    updatedByName: contributorName(contributor),
    updatedAt: actionTime,
  });
  const value = { ...availability, ...update };
  const reference = doc(
    db,
    COLLECTIONS.availability,
    availability.documentId ??
      availabilityDocumentId(availability.locationId, availability.sodaId, availability.form),
  );
  return {
    value,
    committed: updateDoc(reference, { ...update, updatedAt: Timestamp.fromDate(actionTime) }),
  };
}
