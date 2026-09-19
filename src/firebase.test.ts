import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  app: { name: "test-app" },
  auth: { emulatorConfig: null },
  connectedAuth: { emulatorConfig: { host: "127.0.0.1", port: 9099 } },
  cache: { kind: "persistent" },
  existingFirestore: { name: "existing-firestore" },
  localPersistence: { kind: "local" },
  tabManager: { kind: "multi-tab" },
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  getApp: vi.fn(),
  getApps: vi.fn(),
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
  initializeAuth: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApp: firebase.getApp,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
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
    vi.stubEnv("VITE_FIREBASE_API_KEY", "test-api-key");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo-simply-fizzed");
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "test-measurement-id");
    firebase.getApps.mockReturnValue([]);
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.initializeAuth.mockReturnValue(firebase.auth);
    firebase.persistentMultipleTabManager.mockReturnValue(firebase.tabManager);
    firebase.persistentLocalCache.mockReturnValue(firebase.cache);
    firebase.initializeFirestore.mockReturnValue({ name: "test-firestore" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables local persistence and connects demo projects to the emulators", async () => {
    await import("./firebase");

    expect(firebase.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-api-key",
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
    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
  });

  it("does not connect non-demo projects to any emulator", async () => {
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "live-project");

    await import("./firebase");

    expect(firebase.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firebase.connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});
