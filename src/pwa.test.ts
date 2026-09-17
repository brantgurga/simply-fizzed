import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./pwa";

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (originalServiceWorker) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

describe("registerServiceWorker", () => {
  it("does not register a service worker during development", () => {
    vi.stubEnv("PROD", false);
    const register = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));

    expect(register).not.toHaveBeenCalled();
  });

  it("registers the app service worker after production loads", async () => {
    vi.stubEnv("PROD", true);
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    registerServiceWorker();
    window.dispatchEvent(new Event("load"));
    await Promise.resolve();

    expect(register).toHaveBeenCalledWith("/sw.js");
  });
});
