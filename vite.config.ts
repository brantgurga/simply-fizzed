// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";
import { brand } from "./src/branding.ts";
import { browserThemeColors } from "./src/theme-tokens.ts";

const installAssets = [
  brand.favicon,
  brand.appleTouchIcon,
  ...brand.icons.map(({ src }) => src),
  ...brand.screenshots.map(({ src }) => src),
].map((path) => path.replace(/^\//u, ""));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "brand-html",
      transformIndexHtml(html) {
        return html
          .replaceAll("%BRAND_NAME%", brand.name)
          .replaceAll("%BRAND_FAVICON%", brand.favicon)
          .replaceAll("%BRAND_APPLE_TOUCH_ICON%", brand.appleTouchIcon)
          .replaceAll("%THEME_LIGHT%", browserThemeColors.light)
          .replaceAll("%THEME_DARK%", browserThemeColors.dark);
      },
    },
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: installAssets,
      manifest: {
        id: "/",
        name: brand.name,
        short_name: brand.shortName,
        description: brand.description,
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: browserThemeColors.background,
        theme_color: browserThemeColors.light,
        icons: brand.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
        screenshots: brand.screenshots.map(({ src, sizes, type, formFactor, label }) => ({
          src,
          sizes,
          type,
          form_factor: formFactor,
          label,
        })),
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    pool: "vmThreads",
    setupFiles: "./src/test/setup.ts",
    // Dedicated runners own browser E2E and Firebase emulator-backed tests.
    exclude: [...configDefaults.exclude, "e2e/**", "firestore-rules/**", "functions/**"],
  },
});
