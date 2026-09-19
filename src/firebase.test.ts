import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  app: { name: "test-app" },
  appCheck: { app: { name: "test-app" } },
  auth: { emulatorConfig: null },
  connectedAuth: { emulatorConfig: { host: "127.0.0.1", port: 9099 } },
  cache: { kind: "persistent" },
  existingFirestore: { name: "existing-firestore" },
  localPersistence: { kind: "local" },
  remoteConfig: {
    defaultConfig: {},
    settings: { fetchTimeoutMillis: 0, minimumFetchIntervalMillis: 0 },
  },
  remoteValue: { asString: vi.fn() },
  tabManager: { kind: "multi-tab" },
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  ensureInitialized: vi.fn(),
  fetchAndActivate: vi.fn(),
  getApp: vi.fn(),
  getApps: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  getRemoteConfig: vi.fn(),
  getValue: vi.fn(),
  initializeApp: vi.fn(),
  initializeAppCheck: vi.fn(),
  initializeAuth: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
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
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: firebase.localPersistence,
  connectAuthEmulator: firebase.connectAuthEmulator,
  getAuth: firebase.getAuth,
  initializeAuth: firebase.initializeAuth,
}));

vi.mock("firebase/firestore", () => ({
  connectFirestoreEmulator: firebase.connectFirestoreEmulator,
  getFirestore: firebase.getFirestore,
  initializeFirestore: firebase.initializeFirestore,
  persistentLocalCache: firebase.persistentLocalCache,
  persistentMultipleTabManager: firebase.persistentMultipleTabManager,
}));

describe("Firebase initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo-simply-fizzed");
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "test-measurement-id");
    vi.stubEnv("VITE_FIREBASE_APPCHECK_SITE_KEY", "test-app-check-site-key");
    firebase.getApps.mockReturnValue([]);
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.initializeAppCheck.mockReturnValue(firebase.appCheck);
    firebase.initializeAuth.mockReturnValue(firebase.auth);
    firebase.getRemoteConfig.mockReturnValue(firebase.remoteConfig);
    firebase.ensureInitialized.mockResolvedValue(undefined);
    firebase.fetchAndActivate.mockResolvedValue(true);
    firebase.remoteValue.asString.mockReturnValue("");
    firebase.getValue.mockReturnValue(firebase.remoteValue);
    firebase.remoteConfig.defaultConfig = {};
    firebase.remoteConfig.settings = { fetchTimeoutMillis: 0, minimumFetchIntervalMillis: 0 };
    firebase.persistentMultipleTabManager.mockReturnValue(firebase.tabManager);
    firebase.persistentLocalCache.mockReturnValue(firebase.cache);
    firebase.initializeFirestore.mockReturnValue({ name: "test-firestore" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables local persistence and connects demo projects to the emulators", async () => {
    const { appCheck, isFullAppEnabled, remoteConfig } = await import("./firebase");

    expect(appCheck).toBeUndefined();
    expect(remoteConfig).toBeUndefined();
    await expect(isFullAppEnabled("any.example.com")).resolves.toBe(true);
    expect(firebase.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "demo-simply-fizzed",
        measurementId: "test-measurement-id",
      }),
    );
    expect(firebase.initializeAuth).toHaveBeenCalledWith(firebase.app, {
      persistence: firebase.localPersistence,
    });
    expect(firebase.persistentLocalCache).toHaveBeenCalledWith({ tabManager: firebase.tabManager });
    expect(firebase.initializeFirestore).toHaveBeenCalledWith(firebase.app, {
      localCache: firebase.cache,
    });
    expect(firebase.connectAuthEmulator).toHaveBeenCalledWith(
      firebase.auth,
      "http://127.0.0.1:9099",
    );
    expect(firebase.connectFirestoreEmulator).toHaveBeenCalledWith(
      { name: "test-firestore" },
      "127.0.0.1",
      8080,
    );
    expect(firebase.initializeAppCheck).not.toHaveBeenCalled();
    expect(firebase.getRemoteConfig).not.toHaveBeenCalled();
    expect(firebase.ensureInitialized).not.toHaveBeenCalled();
    expect(firebase.fetchAndActivate).not.toHaveBeenCalled();
  });

  it("reuses HMR instances without reconnecting configured Auth", async () => {
    firebase.getApps.mockReturnValue([firebase.app]);
    firebase.getApp.mockReturnValue(firebase.app);
    firebase.getAuth.mockReturnValue(firebase.connectedAuth);
    firebase.getFirestore.mockReturnValue(firebase.existingFirestore);

    await import("./firebase");

    expect(firebase.getAuth).toHaveBeenCalledWith(firebase.app);
    expect(firebase.getFirestore).toHaveBeenCalledWith(firebase.app);
    expect(firebase.initializeApp).not.toHaveBeenCalled();
    expect(firebase.initializeAuth).not.toHaveBeenCalled();
    expect(firebase.initializeFirestore).not.toHaveBeenCalled();
    expect(firebase.initializeAppCheck).not.toHaveBeenCalled();
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("exports App Check and configures Remote Config for non-demo projects", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");

    const { appCheck, remoteConfig } = await import("./firebase");

    expect(appCheck).toBe(firebase.appCheck);
    expect(remoteConfig).toBe(firebase.remoteConfig);
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(firebase.initializeAppCheck).toHaveBeenCalledWith(firebase.app, {
      provider: expect.objectContaining({ siteKey: "test-app-check-site-key" }),
      isTokenAutoRefreshEnabled: true,
    });
    expect(firebase.getRemoteConfig).toHaveBeenCalledWith(firebase.app);
    expect(firebase.remoteConfig.settings).toEqual({
      fetchTimeoutMillis: 5_000,
      minimumFetchIntervalMillis: 300_000,
    });
    expect(firebase.remoteConfig.defaultConfig).toEqual({ enabled_hostnames: "" });
  });

  it("fetches the allowlist before checking the current hostname", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");
    firebase.remoteValue.asString.mockReturnValue("staging.example.com, preview.example.com");
    const { isFullAppEnabled } = await import("./firebase");

    await expect(isFullAppEnabled("STAGING.EXAMPLE.COM")).resolves.toBe(true);
    expect(firebase.ensureInitialized).toHaveBeenCalledWith(firebase.remoteConfig);
    expect(firebase.fetchAndActivate).toHaveBeenCalledWith(firebase.remoteConfig);
    expect(firebase.getValue).toHaveBeenCalledWith(firebase.remoteConfig, "enabled_hostnames");
  });

  it("uses an initialized cached allowlist when a refresh fails", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");
    firebase.remoteValue.asString.mockReturnValue("staging.example.com");
    firebase.fetchAndActivate.mockRejectedValue(new Error("offline"));
    const { isFullAppEnabled } = await import("./firebase");

    await expect(isFullAppEnabled("staging.example.com")).resolves.toBe(true);
    expect(firebase.ensureInitialized.mock.invocationCallOrder[0]).toBeLessThan(
      firebase.getValue.mock.invocationCallOrder[0]!,
    );
  });

  it("fails closed when Remote Config is unavailable without a cached value", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");
    firebase.fetchAndActivate.mockRejectedValue(new Error("offline"));
    const { isFullAppEnabled } = await import("./firebase");

    await expect(isFullAppEnabled("staging.example.com")).resolves.toBe(false);
  });
});
