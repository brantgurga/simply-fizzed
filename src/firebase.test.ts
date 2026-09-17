import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  app: { name: "test-app" },
  cache: { kind: "persistent" },
  tabManager: { kind: "multi-tab" },
  connectFirestoreEmulator: vi.fn(),
  getApp: vi.fn(),
  getApps: vi.fn(),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
}));

vi.mock("firebase/app", () => ({
  getApp: firebase.getApp,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
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
    firebase.getApps.mockReturnValue([]);
    firebase.initializeApp.mockReturnValue(firebase.app);
    firebase.persistentMultipleTabManager.mockReturnValue(firebase.tabManager);
    firebase.persistentLocalCache.mockReturnValue(firebase.cache);
    firebase.initializeFirestore.mockReturnValue({ name: "test-firestore" });
  });

  it("enables persistent multi-tab caching for a new app", async () => {
    await import("./firebase");

    expect(firebase.persistentLocalCache).toHaveBeenCalledWith({ tabManager: firebase.tabManager });
    expect(firebase.initializeFirestore).toHaveBeenCalledWith(firebase.app, {
      localCache: firebase.cache,
    });
  });
});
