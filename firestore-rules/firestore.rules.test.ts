import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";

const PROJECT_ID = "demo-simply-fizzed";
const USER_ID = "rules-test-user";
const RULES_PATH = new URL("../firestore.rules", import.meta.url);

let testEnvironment: RulesTestEnvironment;

function validLocation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Boundary Soda Shop",
    address: {
      street: "1 Main Street",
      city: "Indianapolis",
      state: "Indiana",
      postalCode: "46204",
    },
    geo: { lat: 39.7684, lng: -86.1581 },
    geohash: "dp4dpr",
    createdBy: USER_ID,
    createdByName: "Rules Test Fan",
    createdAt: serverTimestamp(),
    updatedBy: USER_ID,
    updatedByName: "Rules Test Fan",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile(RULES_PATH, "utf8") },
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("public reads", () => {
  it.each(["locations", "sodas", "availability"])(
    "allows reads from %s",
    async (collectionName) => {
      const database = testEnvironment.unauthenticatedContext().firestore();

      await assertSucceeds(getDoc(doc(database, collectionName, "public-document")));
      await assertSucceeds(getDocs(collection(database, collectionName)));
    },
  );
});

describe("location creation", () => {
  it("denies unauthenticated creation even with claimed attribution", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(setDoc(doc(database, "locations", "claimed-user"), validLocation()));
  });

  it("allows authenticated creation with matching attribution and a server timestamp", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(setDoc(doc(database, "locations", "valid"), validLocation()));
  });

  it("allows an empty sentinel when no friendly name is available", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const location = validLocation({ createdByName: "", updatedByName: "" });

    await assertSucceeds(setDoc(doc(database, "locations", "unknown-friendly-name"), location));
  });

  it("allows representative maximum string and coordinate boundaries", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const boundaryLocation = validLocation({
      name: "N".repeat(200),
      address: {
        street: "S".repeat(200),
        city: "C".repeat(100),
        state: "T".repeat(100),
        postalCode: "P".repeat(20),
      },
      geo: { lat: 90, lng: -180 },
      geohash: "G".repeat(20),
      createdByName: "C".repeat(320),
      updatedByName: "C".repeat(320),
    });

    await assertSucceeds(setDoc(doc(database, "locations", "boundaries"), boundaryLocation));
  });

  it.each([
    ["forged creator attribution", { createdBy: "another-user" }],
    ["forged updater attribution", { updatedBy: "another-user" }],
    ["missing creator name", { createdByName: undefined }],
    ["missing updater name", { updatedByName: undefined }],
    ["mismatched updater name", { updatedByName: "Another Fan" }],
    ["missing creation timestamp", { createdAt: undefined }],
    ["client-generated creation timestamp", { createdAt: Timestamp.fromMillis(0) }],
    ["missing update timestamp", { updatedAt: undefined }],
    ["client-generated update timestamp", { updatedAt: Timestamp.fromMillis(0) }],
  ])("denies %s", async (_description, overrides) => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const location = validLocation(overrides);
    if (location["createdByName"] === undefined) delete location["createdByName"];
    if (location["updatedByName"] === undefined) delete location["updatedByName"];
    if (location["createdAt"] === undefined) delete location["createdAt"];
    if (location["updatedAt"] === undefined) delete location["updatedAt"];

    await assertFails(setDoc(doc(database, "locations", "invalid-attribution"), location));
  });

  it.each([
    ["missing required field", { geohash: undefined }],
    ["unexpected field", { moderationStatus: "approved" }],
    ["incorrect field type", { name: 42 }],
    ["blank string", { name: "   \t" }],
    ["oversized string", { name: "N".repeat(201) }],
    ["blank attribution names", { createdByName: "   \t", updatedByName: "   \t" }],
    [
      "oversized attribution names",
      { createdByName: "C".repeat(321), updatedByName: "C".repeat(321) },
    ],
    ["address missing a field", { address: { street: "1 Main", city: "Indy", state: "IN" } }],
    [
      "address with an unexpected field",
      {
        address: {
          street: "1 Main",
          city: "Indy",
          state: "IN",
          postalCode: "46204",
          country: "US",
        },
      },
    ],
    ["out-of-range latitude", { geo: { lat: 90.0001, lng: 0 } }],
    ["out-of-range longitude", { geo: { lat: 0, lng: -180.0001 } }],
  ])("rejects %s", async (_description, overrides) => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const location = validLocation(overrides);
    if (location["geohash"] === undefined) delete location["geohash"];

    await assertFails(setDoc(doc(database, "locations", "invalid-shape"), location));
  });
});

describe("immutable locations", () => {
  it.each(["update", "delete"])("denies %s by the original creator", async (operation) => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "locations", "existing"), validLocation());
    });
    const reference = doc(
      testEnvironment.authenticatedContext(USER_ID).firestore(),
      "locations",
      "existing",
    );

    const request =
      operation === "update" ? updateDoc(reference, { name: "Changed" }) : deleteDoc(reference);
    await assertFails(request);
  });
});

describe("protected collections and unmatched paths", () => {
  it.each(["sodas", "availability"])(
    "denies unauthenticated and authenticated writes to %s",
    async (collectionName) => {
      const unauthenticated = testEnvironment.unauthenticatedContext().firestore();
      const authenticated = testEnvironment.authenticatedContext(USER_ID).firestore();

      await assertFails(
        setDoc(doc(unauthenticated, collectionName, "new-document"), { name: "Cola" }),
      );
      await assertFails(
        setDoc(doc(authenticated, collectionName, "new-document"), { name: "Cola" }),
      );
    },
  );

  it.each(["private/document", "locations/location/private/document"])(
    "denies reads and writes to unmatched path %s",
    async (path) => {
      const database = testEnvironment.authenticatedContext(USER_ID).firestore();
      const reference = doc(database, path);

      await assertFails(getDoc(reference));
      await assertFails(setDoc(reference, { value: true }));
    },
  );
});
