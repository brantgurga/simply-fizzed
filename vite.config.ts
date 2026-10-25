// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import react from "@vitejs/plugin-react";
import { loadEnv, type HtmlTagDescriptor } from "vite";
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

export function firebaseStartupPreconnectTags(projectId: string | undefined): HtmlTagDescriptor[] {
  if (!projectId || projectId.startsWith("demo-")) return [];

  return [
    { tag: "link", attrs: { rel: "preconnect", href: "https://www.google.com" } },
    {
      tag: "link",
      attrs: {
        rel: "preconnect",
        href: "https://firebaseinstallations.googleapis.com",
        crossorigin: true,
      },
    },
    {
      tag: "link",
      attrs: {
        rel: "preconnect",
        href: "https://firebaseremoteconfig.googleapis.com",
        crossorigin: true,
      },
    },
  ];
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    // The service worker precaches every chunk. Keep startup-only dependencies
    // separate from Firebase services that load through the App import.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase-startup",
              test: /node_modules[\\/](@firebase[\\/](app|app-check|component|installations|logger|remote-config|util)|firebase[\\/](app|app-check|remote-config))[\\/]/u,
              priority: 60,
            },
            {
              name: "firestore",
              test: /node_modules[\\/](@firebase[\\/]firestore|firebase[\\/]firestore)[\\/]/u,
              priority: 50,
            },
            {
              name: "firebase-auth",
              test: /node_modules[\\/](@firebase[\\/]auth|firebase[\\/]auth)[\\/]/u,
              priority: 40,
            },
            {
              name: "firebase-functions",
              test: /node_modules[\\/](@firebase[\\/]functions|firebase[\\/]functions)[\\/]/u,
              priority: 30,
            },
            {
              name: "mui",
              test: /node_modules[\\/](@emotion|@mui)[\\/]/u,
              priority: 20,
            },
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/u,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  plugins: [
    {
      name: "firebase-startup-preconnect",
      transformIndexHtml() {
        const { VITE_FIREBASE_PROJECT_ID: projectId } = loadEnv(mode, process.cwd());
        return firebaseStartupPreconnectTags(projectId);
      },
    },
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
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff2}"],
        globIgnores: [
          "**/App-*.js",
          "**/firebase-auth-*.js",
          "**/firebase-functions-*.js",
          "**/firestore-*.js",
        ],
        // Cache deferred chunks only after an enabled visitor requests them, so
        // the full app remains available on later offline launches.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:App|firebase-auth|firebase-functions|firestore)-[^/]+\.js$/u,
            handler: "CacheFirst",
            options: {
              cacheName: "deferred-app-chunks",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 8 },
            },
          },
        ],
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
}));
