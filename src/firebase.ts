// Firebase client initialization. The web app configuration is read from
// `VITE_FIREBASE_*` environment variables (see `.env` / `.env.example`) rather
// than hardcoded, so values differ per environment without code changes.
import { getApp, getApps, initializeApp } from "firebase/app";
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

export const db = existingApp
  ? getFirestore(app)
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });

// A `demo-` project id marks an emulator-only configuration (local dev and e2e
// both use `demo-simply-fizzed`). In that case connect Firestore to the local
// emulator; production configs use real Firebase with no manual flag.
if (firebaseConfig.projectId.startsWith("demo-")) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
