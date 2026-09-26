// Playwright global setup: clear the Auth and Firestore emulators, then seed
// deterministic Firestore fixtures. Playwright starts the `webServer` (which
// boots all three emulators) first; explicit readiness checks remove startup
// races. Writes use `firebase-admin`,
// which bypasses security rules, mirroring how production data is populated out
// of band. Everything targets the offline `demo-` project, so no credentials or
// network access are involved.
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import waitOn from "wait-on";
import { AVAILABILITY, geohashFor, LOCATIONS, SODAS } from "./fixtures.ts";

const PROJECT_ID = "demo-simply-fizzed";
const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const READY_TIMEOUT_MS = 60_000;
const READY_INTERVAL_MS = 500;

/**
 * Resolve once both data emulators answer, or throw after a timeout. Firestore
 * needs a GET because its root does not answer HEAD with a 2xx; Auth only needs
 * its TCP listener to be ready.
 */
function waitForEmulators(): Promise<void> {
  return waitOn({
    resources: [`tcp:${AUTH_EMULATOR_HOST}`, `http-get://${FIRESTORE_EMULATOR_HOST}/`],
    timeout: READY_TIMEOUT_MS,
    interval: READY_INTERVAL_MS,
  });
}

/** Remove any data left from a previous (reused) emulator run. */
async function clearEmulators(): Promise<void> {
  const urls = [
    `http://${AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  ];
  const responses = await Promise.all(urls.map((url) => fetch(url, { method: "DELETE" })));
  const failedResponse = responses.find((response) => !response.ok);
  if (failedResponse !== undefined) {
    throw new Error(`Failed to clear Firebase emulator: ${failedResponse.status.toString()}`);
  }
}

export default async function globalSetup(): Promise<void> {
  // The admin SDK reads this to target the emulator instead of production.
  process.env["FIRESTORE_EMULATOR_HOST"] = FIRESTORE_EMULATOR_HOST;

  await waitForEmulators();
  await clearEmulators();

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
        ...(soda.aliases === undefined ? {} : { aliases: soda.aliases }),
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
        canSample: item.canSample,
        canPurchase: item.canPurchase,
      });
    }

    await batch.commit();
  } finally {
    await deleteApp(app);
  }
}
