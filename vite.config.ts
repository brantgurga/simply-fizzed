import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

function pwaServiceWorker(): Plugin {
  return {
    name: "pwa-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const template = readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
      const bundleOutputs = Object.values(bundle).toSorted((left, right) =>
        left.fileName.localeCompare(right.fileName),
      );
      const bundleAssets = bundleOutputs.map(({ fileName }) => `/${fileName}`);
      const publicAssets = [
        "/favicon.svg",
        "/icon-192.png",
        "/icon-512.png",
        "/manifest.webmanifest",
      ];
      const precacheAssets = ["/", ...publicAssets, ...bundleAssets];
      const versionHash = createHash("sha256")
        .update(template)
        .update(JSON.stringify(precacheAssets));

      for (const output of bundleOutputs) {
        versionHash.update(output.type === "asset" ? output.source : output.code);
      }
      for (const asset of publicAssets) {
        versionHash.update(readFileSync(new URL(`./public${asset}`, import.meta.url)));
      }

      const version = versionHash.digest("hex").slice(0, 12);
      const source = template
        .replace("__CACHE_VERSION__", version)
        .replace("/* __PRECACHE_ASSETS__ */ []", JSON.stringify(precacheAssets));

      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pwaServiceWorker()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    // Playwright owns the e2e directory; keep Vitest out of it.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
