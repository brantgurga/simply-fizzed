import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-192.png",
        "icon-maskable-512.png",
        "screenshot-narrow.png",
        "screenshot-wide.png",
      ],
      manifest: {
        id: "/",
        name: "Simply Fizzed",
        short_name: "SimFiz",
        description: "Find sodas and the places that serve them.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#FFF8E7",
        theme_color: "#6B3418",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshot-wide.png",
            sizes: "1280x768",
            type: "image/png",
            form_factor: "wide",
            label: "Simply Fizzed desktop search",
          },
          {
            src: "/screenshot-narrow.png",
            sizes: "750x750",
            type: "image/png",
            form_factor: "narrow",
            label: "Simply Fizzed mobile search",
          },
        ],
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
