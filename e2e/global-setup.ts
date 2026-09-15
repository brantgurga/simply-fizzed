// Playwright global setup: seed the Firestore emulator with deterministic
// fixtures before any test runs. Playwright starts the `webServer` (which boots
// the hosting + firestore emulators) and waits for it to respond before running
// this file, so the emulator is expected to be up by now; we still wait on its
// readiness endpoint to remove any start-up race. Writes use `firebase-admin`,
// which bypasses security rules, mirroring how production data is populated out
// of band. Everything targets the offline `demo-` project, so no credentials or
// network access are involved.
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import waitOn from "wait-on";
import { AVAILABILITY, geohashFor, LOCATIONS, SODAS } from "./fixtures.ts";

const PROJECT_ID = "demo-simply-fizzed";
const EMULATOR_HOST = "127.0.0.1:8080";
const READY_TIMEOUT_MS = 60_000;
const READY_INTERVAL_MS = 500;

/**
 * Resolve once the Firestore emulator answers, or throw after a timeout. Uses
 * the `http-get://` scheme so wait-on issues a GET (the emulator root does not
 * answer HEAD with a 2xx) instead of the default HEAD.
 */
function waitForEmulator(): Promise<void> {
  return waitOn({
    resources: [`http-get://${EMULATOR_HOST}/`],
    timeout: READY_TIMEOUT_MS,
    interval: READY_INTERVAL_MS,
  });
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
