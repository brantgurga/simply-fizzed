// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// Firebase client service initialization. The app, App Check, and availability
// check live in a lightweight startup module so heavier services load with App.
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  type Firestore,
  getDocsFromServer,
  getFirestore,
  initializeFirestore,
  limit,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { app, existingApp, isDemoProject } from "./firebase-startup";
import { COLLECTIONS } from "./model/firestore";

export { app, appCheck, isFullAppEnabled } from "./firebase-startup";

// Reuse Firebase service instances across HMR reloads. Keep authenticated
// sessions available when the installed app starts offline, and use IndexedDB
// so completed queries remain available offline and writes queue until reconnect.
export const auth = existingApp
  ? getAuth(app)
  : initializeAuth(app, { persistence: browserLocalPersistence });

export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });

export const functions = getFunctions(app, "us-central1");

/**
 * Confirm that Firestore can serve data from the backend, rather than allowing an
 * empty persistent cache to masquerade as an empty database. An offline browser
 * may continue using cached data and retries this check when it reconnects.
 */
export async function isFirestoreAvailable(
  database: Firestore,
  online = navigator.onLine,
): Promise<boolean> {
  try {
    await getDocsFromServer(query(collection(database, COLLECTIONS.locations), limit(1)));
    return true;
  } catch {
    return !online;
  }
}

// A `demo-` project id marks an emulator-only configuration (local dev and e2e
// both use `demo-simply-fizzed`). Production configs use real Firebase with no
// manual flag. Guard Auth for HMR, where the shared instance may already be
// connected.
if (isDemoProject) {
  if (auth.emulatorConfig === null) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
  }
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  if (!existingApp) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
