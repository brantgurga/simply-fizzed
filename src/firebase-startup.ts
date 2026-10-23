// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  ensureInitialized,
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  isSupported,
} from "firebase/remote-config";
import { isHostnameEnabled } from "./availability";

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

export const existingApp = getApps().length > 0;
export const isDemoProject = firebaseConfig.projectId.startsWith("demo-");
export const app = existingApp ? getApp() : initializeApp(firebaseConfig);

// App Check starts before any other Firebase service imports this module. Calling
// with the same options reuses its instance during HMR.
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
