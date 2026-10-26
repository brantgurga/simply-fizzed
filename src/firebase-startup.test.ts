// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  app: { name: "test-app" },
  appCheck: { app: { name: "test-app" } },
  remoteConfig: {
    defaultConfig: {},
    settings: { fetchTimeoutMillis: 0, minimumFetchIntervalMillis: 0 },
  },
  remoteValue: { asString: vi.fn() },
  ensureInitialized: vi.fn(),
  fetchAndActivate: vi.fn(),
  getApp: vi.fn(),
  getApps: vi.fn(),
  getRemoteConfig: vi.fn(),
  getValue: vi.fn(),
  initializeApp: vi.fn(),
  initializeAppCheck: vi.fn(),
  isSupported: vi.fn(),
  ReCaptchaEnterpriseProvider: class {
    readonly siteKey: string;

    constructor(siteKey: string) {
      this.siteKey = siteKey;
    }
  },
}));

vi.mock("firebase/app", () => ({
  getApp: firebase.getApp,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
}));

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: firebase.initializeAppCheck,
  ReCaptchaEnterpriseProvider: firebase.ReCaptchaEnterpriseProvider,
}));

vi.mock("firebase/remote-config", () => ({
  ensureInitialized: firebase.ensureInitialized,
  fetchAndActivate: firebase.fetchAndActivate,
  getRemoteConfig: firebase.getRemoteConfig,
  getValue: firebase.getValue,
  isSupported: firebase.isSupported,
}));

describe("Firebase startup initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "test-measurement-id");
    vi.stubEnv("VITE_FIREBASE_APPCHECK_SITE_KEY", "test-app-check-site-key");
    firebase.getApps.mockReturnValue([]);
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.initializeAppCheck.mockReturnValue(firebase.appCheck);
    firebase.getRemoteConfig.mockReturnValue(firebase.remoteConfig);
    firebase.isSupported.mockResolvedValue(true);
    firebase.ensureInitialized.mockResolvedValue(undefined);
    firebase.fetchAndActivate.mockResolvedValue(true);
    firebase.remoteValue.asString.mockReturnValue("");
    firebase.getValue.mockReturnValue(firebase.remoteValue);
    firebase.remoteConfig.defaultConfig = {};
    firebase.remoteConfig.settings = { fetchTimeoutMillis: 0, minimumFetchIntervalMillis: 0 };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("initializes only the app and App Check before the availability decision", async () => {
    const { app, appCheck } = await import("./firebase-startup");

    expect(app).toBe(firebase.app);
    expect(appCheck).toBe(firebase.appCheck);
    expect(firebase.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "live-project", measurementId: "test-measurement-id" }),
    );
    expect(firebase.initializeAppCheck).toHaveBeenCalledWith(firebase.app, {
      provider: expect.objectContaining({ siteKey: "test-app-check-site-key" }),
      isTokenAutoRefreshEnabled: true,
    });
    expect(firebase.getRemoteConfig).not.toHaveBeenCalled();
  });

  it("reuses the app and App Check instances during HMR", async () => {
    firebase.getApps.mockReturnValue([firebase.app]);
    firebase.getApp.mockReturnValue(firebase.app);

    const { app, appCheck } = await import("./firebase-startup");

    expect(app).toBe(firebase.app);
    expect(appCheck).toBe(firebase.appCheck);
    expect(firebase.initializeApp).not.toHaveBeenCalled();
    expect(firebase.initializeAppCheck).toHaveBeenCalledOnce();
  });

  it("enables demo projects without App Check or Remote Config", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo-simply-fizzed");

    const { appCheck, isFullAppEnabled } = await import("./firebase-startup");

    expect(appCheck).toBeUndefined();
    await expect(isFullAppEnabled("any.example.com")).resolves.toBe(true);
    expect(firebase.initializeAppCheck).not.toHaveBeenCalled();
    expect(firebase.isSupported).not.toHaveBeenCalled();
  });

  it("fetches the configured hostname allowlist", async () => {
    firebase.remoteValue.asString.mockReturnValue("staging.example.com, preview.example.com");
    const { isFullAppEnabled } = await import("./firebase-startup");

    await expect(isFullAppEnabled("STAGING.EXAMPLE.COM")).resolves.toBe(true);
    expect(firebase.remoteConfig.settings).toEqual({
      fetchTimeoutMillis: 5_000,
      minimumFetchIntervalMillis: 300_000,
    });
    expect(firebase.remoteConfig.defaultConfig).toEqual({ enabled_hostnames: "" });
    expect(firebase.ensureInitialized).toHaveBeenCalledWith(firebase.remoteConfig);
    expect(firebase.fetchAndActivate).toHaveBeenCalledWith(firebase.remoteConfig);
    expect(firebase.getValue).toHaveBeenCalledWith(firebase.remoteConfig, "enabled_hostnames");
  });

  it("uses an initialized cached allowlist when refresh fails", async () => {
    firebase.remoteValue.asString.mockReturnValue("staging.example.com");
    firebase.fetchAndActivate.mockRejectedValue(new Error("offline"));
    const { isFullAppEnabled } = await import("./firebase-startup");

    await expect(isFullAppEnabled("staging.example.com")).resolves.toBe(true);
    expect(firebase.ensureInitialized.mock.invocationCallOrder[0]).toBeLessThan(
      firebase.getValue.mock.invocationCallOrder[0]!,
    );
  });

  it("fails closed without a cached allowlist when refresh fails offline", async () => {
    firebase.fetchAndActivate.mockRejectedValue(new Error("offline"));
    const { isFullAppEnabled } = await import("./firebase-startup");

    await expect(isFullAppEnabled("staging.example.com")).resolves.toBe(false);
  });

  it("fails closed when browser storage is unavailable", async () => {
    firebase.isSupported.mockResolvedValue(false);
    const { isFullAppEnabled } = await import("./firebase-startup");

    await expect(isFullAppEnabled("staging.example.com")).resolves.toBe(false);
    expect(firebase.getRemoteConfig).not.toHaveBeenCalled();
  });
});
