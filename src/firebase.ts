// Firebase client initialization. The web app configuration is read from
// `VITE_FIREBASE_*` environment variables (see `.env` / `.env.example`) rather
// than hardcoded, so values differ per environment without code changes.
import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
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
import {
  ensureInitialized,
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  isSupported,
} from "firebase/remote-config";
import { isHostnameEnabled } from "./availability";
import { COLLECTIONS } from "./model/firestore";

const ENABLED_HOSTNAMES_PARAMETER = "enabled_hostnames";
const REMOTE_CONFIG_FETCH_INTERVAL_MILLIS = 5 * 60 * 1000;
const REMOTE_CONFIG_FETCH_TIMEOUT_MILLIS = 5 * 1000;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Reuse Firebase instances across HMR reloads. New instances use IndexedDB so
// completed queries remain available offline and writes queue until reconnect.
const existingApp = getApps().length > 0;
const isDemoProject = firebaseConfig.projectId.startsWith("demo-");
export const app = existingApp ? getApp() : initializeApp(firebaseConfig);

// App Check is production-only: demo projects stay fully offline for local and
// e2e use. Reinitialization with the same options returns the existing instance
// during HMR, so Firebase services and integrations share one App Check instance.
export const appCheck = isDemoProject
  ? undefined
  : initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });

export async function isFullAppEnabled(hostname: string): Promise<boolean> {
  if (isDemoProject) return true;

  try {
    if (!(await isSupported())) return false;

    const remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = REMOTE_CONFIG_FETCH_INTERVAL_MILLIS;
    remoteConfig.settings.fetchTimeoutMillis = REMOTE_CONFIG_FETCH_TIMEOUT_MILLIS;
    remoteConfig.defaultConfig = { [ENABLED_HOSTNAMES_PARAMETER]: "" };
    await ensureInitialized(remoteConfig);

    try {
      await fetchAndActivate(remoteConfig);
    } catch {
      // Use the last activated value, or the fail-closed default, when offline.
    }

    return isHostnameEnabled(
      hostname,
      getValue(remoteConfig, ENABLED_HOSTNAMES_PARAMETER).asString(),
    );
  } catch {
    // Browser storage and Remote Config initialization failures fail closed.
    return false;
  }
}

// Keep authenticated sessions in IndexedDB/localStorage so they remain
// available when the installed app starts offline.
export const auth = existingApp
  ? getAuth(app)
  : initializeAuth(app, { persistence: browserLocalPersistence });

export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });

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
}
