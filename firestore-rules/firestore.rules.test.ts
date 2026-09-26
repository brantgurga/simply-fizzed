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
  writeBatch,
} from "firebase/firestore";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";

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

const validSoda = {
  name: "Cola",
  brand: "Coca-Cola",
  flavor: "Original",
  aliases: ["Coke"],
};

function validNewSoda(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Root Beer",
    brand: "Sprecher",
    flavor: "Original",
    initialAvailabilityId: "existing-location$new-soda$draft",
    createdBy: USER_ID,
    createdByName: "Rules Test Fan",
    createdAt: serverTimestamp(),
    updatedBy: USER_ID,
    updatedByName: "Rules Test Fan",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function validAvailability(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locationId: "existing-location",
    sodaId: "existing-soda",
    form: "can",
    sodaName: validSoda.name,
    sodaBrand: validSoda.brand,
    sodaFlavor: validSoda.flavor,
    canSample: "unknown",
    canPurchase: "unknown",
    createdBy: USER_ID,
    createdByName: "Rules Test Fan",
    createdAt: serverTimestamp(),
    updatedBy: USER_ID,
    updatedByName: "Rules Test Fan",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function canonicalAvailabilityId(availability: Record<string, unknown>): string {
  const locationId =
    typeof availability["locationId"] === "string"
      ? availability["locationId"]
      : "invalid-location";
  const sodaId =
    typeof availability["sodaId"] === "string" ? availability["sodaId"] : "invalid-soda";
  const form = typeof availability["form"] === "string" ? availability["form"] : "invalid-form";
  return `${locationId}$${sodaId}$${form}`;
}

function validVerification(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locationId: "existing-location",
    verifiedBy: USER_ID,
    verifiedByName: "Rules Test Fan",
    verifiedAt: Timestamp.fromMillis(1_000),
    ...overrides,
  };
}

function validProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    publicName: "Rules Test Fan",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function validRating(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: USER_ID,
    sodaOfferingId: "existing-soda",
    sodaName: validSoda.name,
    sodaBrand: validSoda.brand,
    sodaFlavor: validSoda.flavor,
    rating: null,
    firstRecorded: serverTimestamp(),
    lastRatedAt: null,
    ...overrides,
  };
}

async function seedAvailabilityReferences(): Promise<void> {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, "locations", "existing-location"), validLocation()),
      setDoc(doc(database, "sodas", "existing-soda"), validSoda),
    ]);
  });
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
  it.each(["locations", "sodas", "availability", "verifications"])(
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

describe("availability creation", () => {
  beforeEach(seedAvailabilityReferences);

  it("allows an authenticated exact, attributed record with independent details", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(
      setDoc(
        doc(database, "availability", "existing-location$existing-soda$can"),
        validAvailability(),
      ),
    );
  });

  it("accepts the client action time used by offline-capable writes", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const actionTime = Timestamp.fromMillis(1_000);

    await assertSucceeds(
      setDoc(
        doc(database, "availability", "existing-location$existing-soda$can"),
        validAvailability({ createdAt: actionTime, updatedAt: actionTime }),
      ),
    );
  });

  it("allows a new soda and its first availability in one atomic write", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const batch = writeBatch(database);
    batch.set(doc(database, "sodas", "new-soda"), validNewSoda());
    batch.set(
      doc(database, "availability", "existing-location$new-soda$draft"),
      validAvailability({
        sodaId: "new-soda",
        form: "draft",
        sodaName: "Root Beer",
        sodaBrand: "Sprecher",
      }),
    );

    await assertSucceeds(batch.commit());
  });

  it("denies unauthenticated creation", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();

    await assertFails(
      setDoc(
        doc(database, "availability", "existing-location$existing-soda$can"),
        validAvailability(),
      ),
    );
  });

  it("denies a duplicate tuple under a non-canonical document ID", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertFails(setDoc(doc(database, "availability", "duplicate-copy"), validAvailability()));
  });

  it("denies referenced IDs containing the reserved separator", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "locations", "location$one"), validLocation());
    });
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertFails(
      setDoc(
        doc(database, "availability", "location$one$existing-soda$can"),
        validAvailability({ locationId: "location$one" }),
      ),
    );
  });

  it.each([
    ["an unsupported form", { form: "case" }],
    ["an incorrect field type", { locationId: 42 }],
    ["forged creator attribution", { createdBy: "another-user" }],
    ["forged updater attribution", { updatedBy: "another-user" }],
    ["mismatched attribution names", { updatedByName: "Another Fan" }],
    ["a blank attribution name", { createdByName: "   \t" }],
    ["an invalid sample value", { canSample: "sometimes" }],
    ["a missing purchase value", { canPurchase: undefined }],
    [
      "a far-future action time",
      {
        createdAt: Timestamp.fromDate(new Date("9999-01-01T00:00:00Z")),
        updatedAt: Timestamp.fromDate(new Date("9999-01-01T00:00:00Z")),
      },
    ],
    ["a missing timestamp", { updatedAt: undefined }],
    ["an unexpected field", { notes: "sale" }],
    ["a mismatched soda name", { sodaName: "Diet Cola" }],
    ["a mismatched soda brand", { sodaBrand: "Other" }],
    ["a mismatched soda flavor", { sodaFlavor: "Cherry" }],
    ["a missing location", { locationId: "missing-location" }],
    ["a missing soda", { sodaId: "missing-soda" }],
  ])("denies %s", async (_description, overrides) => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const availability = validAvailability(overrides);
    for (const [key, value] of Object.entries(availability)) {
      if (value === undefined) delete availability[key];
    }

    await assertFails(
      setDoc(doc(database, "availability", canonicalAvailabilityId(availability)), availability),
    );
  });

  it.each(["update", "delete"])("denies %s", async (operation) => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "availability", "existing"), validAvailability());
    });
    const reference = doc(
      testEnvironment.authenticatedContext(USER_ID).firestore(),
      "availability",
      "existing",
    );
    const request =
      operation === "update" ? updateDoc(reference, { form: "bottle" }) : deleteDoc(reference);

    await assertFails(request);
  });
});

describe("availability detail updates", () => {
  beforeEach(async () => {
    await seedAvailabilityReferences();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const timestamp = Timestamp.fromMillis(1_000);
      await setDoc(
        doc(context.firestore(), "availability", "existing-location$existing-soda$can"),
        validAvailability({ createdAt: timestamp, updatedAt: timestamp }),
      );
    });
  });

  it("allows independent attributed detail updates with a meaningful action time", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(
      updateDoc(doc(database, "availability", "existing-location$existing-soda$can"), {
        canSample: "yes",
        canPurchase: "no",
        updatedBy: USER_ID,
        updatedByName: "Rules Test Fan",
        updatedAt: Timestamp.fromMillis(2_000),
      }),
    );
  });

  it("rejects stale, forged, and immutable-field updates", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const reference = doc(database, "availability", "existing-location$existing-soda$can");

    await assertFails(updateDoc(reference, { updatedAt: Timestamp.fromMillis(500) }));
    await assertFails(
      updateDoc(reference, {
        canSample: "yes",
        updatedBy: USER_ID,
        updatedByName: "Rules Test Fan",
        updatedAt: Timestamp.fromMillis(1_000),
      }),
    );
    await assertFails(
      updateDoc(reference, {
        updatedAt: Timestamp.fromDate(new Date("9999-01-01T00:00:00Z")),
      }),
    );
    await assertFails(
      updateDoc(reference, {
        canSample: "yes",
        canPurchase: "no",
        updatedBy: "another-user",
        updatedByName: "Other",
        updatedAt: Timestamp.fromMillis(2_000),
      }),
    );
    await assertFails(updateDoc(reference, { sodaId: "another-soda" }));
  });

  it("allows legacy availability to gain details and update attribution", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "availability", "legacy"), {
        locationId: "existing-location",
        sodaId: "existing-soda",
        form: "can",
        sodaName: validSoda.name,
        sodaBrand: validSoda.brand,
        sodaFlavor: validSoda.flavor,
        canSample: "no",
        canPurchase: "yes",
      });
    });
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(
      updateDoc(doc(database, "availability", "legacy"), {
        canSample: "unknown",
        canPurchase: "no",
        updatedBy: USER_ID,
        updatedByName: "of…@example.com",
        updatedAt: Timestamp.fromMillis(2_000),
      }),
    );
  });
});

describe("availability verification", () => {
  beforeEach(seedAvailabilityReferences);

  it("allows public history reads and authenticated append-only events", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    await assertSucceeds(
      setDoc(doc(database, "verifications", "verification-one"), validVerification()),
    );

    const publicDatabase = testEnvironment.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(collection(publicDatabase, "verifications")));
  });

  it("accepts action times independent of synchronization time and equal times", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const actionTime = Timestamp.fromMillis(1_000);

    await assertSucceeds(
      setDoc(
        doc(database, "verifications", "offline-one"),
        validVerification({ verifiedAt: actionTime }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(database, "verifications", "offline-two"),
        validVerification({ verifiedAt: actionTime }),
      ),
    );
  });

  it("rejects unauthenticated, forged, missing-location, and mutable events", async () => {
    const unauthenticated = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthenticated, "verifications", "anonymous"), validVerification()),
    );

    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    await assertFails(
      setDoc(
        doc(database, "verifications", "forged"),
        validVerification({ verifiedBy: "another-user" }),
      ),
    );
    await assertFails(
      setDoc(
        doc(database, "verifications", "missing-location"),
        validVerification({ locationId: "missing" }),
      ),
    );
    await assertFails(
      setDoc(
        doc(database, "verifications", "far-future"),
        validVerification({
          verifiedAt: Timestamp.fromDate(new Date("9999-01-01T00:00:00Z")),
        }),
      ),
    );
    await assertSucceeds(setDoc(doc(database, "verifications", "immutable"), validVerification()));
    await assertFails(
      updateDoc(doc(database, "verifications", "immutable"), {
        verifiedAt: Timestamp.fromMillis(2_000),
      }),
    );
  });
});

describe("soda creation and immutability", () => {
  it("denies standalone creation without its initial availability", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertFails(setDoc(doc(database, "sodas", "new-soda"), validNewSoda()));
  });

  it("denies unauthenticated or malformed creation", async () => {
    const unauthenticated = testEnvironment.unauthenticatedContext().firestore();
    const authenticated = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertFails(setDoc(doc(unauthenticated, "sodas", "unauthenticated"), validNewSoda()));
    await assertFails(
      setDoc(doc(authenticated, "sodas", "malformed"), validNewSoda({ brand: " " })),
    );
    await assertFails(setDoc(doc(authenticated, "sodas", "invalid$id"), validNewSoda()));
  });

  it.each(["update", "delete"])("denies %s", async (operation) => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sodas", "existing"), validSoda);
    });
    const reference = doc(
      testEnvironment.authenticatedContext(USER_ID).firestore(),
      "sodas",
      "existing",
    );
    const request =
      operation === "update" ? updateDoc(reference, { flavor: "Cherry" }) : deleteDoc(reference);

    await assertFails(request);
  });
});

describe("public profiles and rating inventories", () => {
  beforeEach(async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await Promise.all([
        setDoc(doc(database, "sodas", "existing-soda"), validSoda),
        setDoc(doc(database, "sodas", "validation-soda"), validSoda),
        setDoc(doc(database, "profiles", USER_ID), {
          publicName: "Rules Test Fan",
          updatedAt: Timestamp.now(),
        }),
        setDoc(doc(database, "profiles", USER_ID, "ratings", "existing-soda"), {
          ...validRating(),
          firstRecorded: Timestamp.now(),
        }),
      ]);
    });
  });

  it("allows unauthenticated profile and inventory reads without enumerating profiles", async () => {
    const database = testEnvironment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(database, "profiles", USER_ID)));
    await assertSucceeds(getDocs(collection(database, "profiles", USER_ID, "ratings")));
    await assertFails(getDocs(collection(database, "profiles")));
  });

  it("allows owners to maintain their profile", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(setDoc(doc(database, "profiles", USER_ID), validProfile()));
    await assertSucceeds(
      updateDoc(doc(database, "profiles", USER_ID), validProfile({ publicName: "Updated Fan" })),
    );
  });

  it("allows unrated and rated record creation", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sodas", "new-unrated"), validSoda);
      await setDoc(doc(context.firestore(), "sodas", "new-rated"), validSoda);
    });
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertSucceeds(
      setDoc(
        doc(database, "profiles", USER_ID, "ratings", "new-unrated"),
        validRating({ sodaOfferingId: "new-unrated" }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(database, "profiles", USER_ID, "ratings", "new-rated"),
        validRating({
          sodaOfferingId: "new-rated",
          rating: 4.5,
          lastRatedAt: serverTimestamp(),
        }),
      ),
    );
  });

  it("allows rating, clearing, and deleting an owned rating record", async () => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();
    const reference = doc(database, "profiles", USER_ID, "ratings", "existing-soda");

    await assertSucceeds(updateDoc(reference, { rating: 4.5, lastRatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(reference, { rating: null, lastRatedAt: null }));
    await assertFails(updateDoc(reference, { firstRecorded: serverTimestamp() }));
    await assertFails(updateDoc(reference, { sodaName: "Renamed" }));
    await assertSucceeds(deleteDoc(reference));
  });

  it.each([
    ["an out-of-range rating", { rating: 6, lastRatedAt: serverTimestamp() }],
    ["a rating without its timestamp", { rating: 3, lastRatedAt: null }],
    ["a forged user", { userId: "another-user" }],
    ["a mismatched soda name", { sodaName: "Other" }],
    ["a client first-recorded timestamp", { firstRecorded: Timestamp.fromMillis(0) }],
    ["an unexpected field", { review: "Great" }],
  ])("denies %s", async (_description, overrides) => {
    const database = testEnvironment.authenticatedContext(USER_ID).firestore();

    await assertFails(
      setDoc(
        doc(database, "profiles", USER_ID, "ratings", "validation-soda"),
        validRating({ sodaOfferingId: "validation-soda", ...overrides }),
      ),
    );
  });

  it("denies profile and rating writes by another user", async () => {
    const database = testEnvironment.authenticatedContext("another-user").firestore();

    await assertFails(setDoc(doc(database, "profiles", USER_ID), validProfile()));
    await assertFails(
      setDoc(doc(database, "profiles", USER_ID, "ratings", "existing-soda"), validRating()),
    );
    await assertFails(deleteDoc(doc(database, "profiles", USER_ID, "ratings", "existing-soda")));
  });
});

describe("protected unmatched paths", () => {
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
