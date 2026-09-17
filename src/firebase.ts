// Firebase client initialization. The web app configuration is read from
// `VITE_FIREBASE_*` environment variables (see `.env` / `.env.example`) rather
// than hardcoded, so values differ per environment without code changes.
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Reuse Firebase instances across HMR reloads. New instances use IndexedDB so
// completed queries remain available offline and writes queue until reconnect.
const existingApp = getApps().length > 0;
export const app = existingApp ? getApp() : initializeApp(firebaseConfig);

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

// A `demo-` project id marks an emulator-only configuration (local dev and e2e
// both use `demo-simply-fizzed`). Production configs use real Firebase with no
// manual flag. Guard Auth for HMR, where the shared instance may already be
// connected.
if (firebaseConfig.projectId.startsWith("demo-")) {
  if (auth.emulatorConfig === null) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
  }
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
