// Playwright global setup: seed the Firestore emulator with deterministic
// fixtures before any test runs. Playwright starts the `webServer` (which boots
// the hosting + firestore emulators) and waits for it to respond before running
// this file, so the emulator is expected to be up by now; we still poll its
// readiness endpoint to remove any start-up race. Writes use `firebase-admin`,
// which bypasses security rules, mirroring how production data is populated out
// of band. Everything targets the offline `demo-` project, so no credentials or
// network access are involved.
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { AVAILABILITY, geohashFor, LOCATIONS, SODAS } from "./fixtures.ts";

const PROJECT_ID = "demo-simply-fizzed";
const EMULATOR_HOST = "127.0.0.1:8080";
const READY_TIMEOUT_MS = 60_000;
const READY_INTERVAL_MS = 500;

/** Resolve after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True once the emulator answers its readiness endpoint. */
async function emulatorReady(): Promise<boolean> {
  try {
    const response = await fetch(`http://${EMULATOR_HOST}/`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve once the Firestore emulator answers, or throw after a timeout. Written
 * as recursion rather than an await-in-loop so each attempt is a single awaited
 * step.
 */
async function waitForEmulator(deadline: number = Date.now() + READY_TIMEOUT_MS): Promise<void> {
  if (await emulatorReady()) return;
  if (Date.now() > deadline) {
    throw new Error(`Firestore emulator at ${EMULATOR_HOST} did not become ready in time.`);
  }
  await delay(READY_INTERVAL_MS);
  return waitForEmulator(deadline);
}

/** Remove any documents left from a previous (reused) emulator run. */
async function clearEmulator(): Promise<void> {
  const url = `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${response.status.toString()}`);
  }
}

export default async function globalSetup(): Promise<void> {
  // The admin SDK reads this to target the emulator instead of production.
  process.env["FIRESTORE_EMULATOR_HOST"] = EMULATOR_HOST;

  await waitForEmulator();
  await clearEmulator();

  const app = initializeApp({ projectId: PROJECT_ID });
  try {
    const db = getFirestore(app);
    const batch = db.batch();

    for (const location of LOCATIONS) {
      batch.set(db.collection("locations").doc(location.id), {
        name: location.name,
        address: location.address,
        geo: location.geo,
        geohash: geohashFor(location),
      });
    }
    for (const soda of SODAS) {
      batch.set(db.collection("sodas").doc(soda.id), {
        name: soda.name,
        brand: soda.brand,
        flavor: soda.flavor,
      });
    }
    for (const item of AVAILABILITY) {
      batch.set(db.collection("availability").doc(item.id), {
        locationId: item.locationId,
        sodaId: item.sodaId,
        form: item.form,
        sodaName: item.sodaName,
        sodaBrand: item.sodaBrand,
        sodaFlavor: item.sodaFlavor,
      });
    }

    await batch.commit();
  } finally {
    await deleteApp(app);
  }
}
