import { defineConfig, devices } from "@playwright/test";

// Keep browser binaries hermetic (under node_modules) so they stay on the same
// drive as the repo. Must match the value used at `playwright install` time.
process.env["PLAYWRIGHT_BROWSERS_PATH"] ??= "0";

const isCI = !!process.env["CI"];
// The Firebase Hosting emulator serves the production build (from `dist`) on this
// port. E2E tests run against that emulator so they exercise the same hosting
// behavior (rewrites, headers) as production rather than the raw Vite preview.
const PORT = 5000;
const baseURL = `http://127.0.0.1:${PORT}`;

// https://playwright.dev/docs/test-configuration
export default defineConfig({
  testDir: "./e2e",
  // Seed the Firestore emulator with deterministic fixtures before any test.
  // Playwright waits for the webServer (below) to respond before running this,
  // so the emulator is up by the time it seeds.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Serialize in CI for stability; let Playwright pick the worker count locally.
  ...(isCI ? { workers: 1 } : {}),
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    // Build the app and serve it via the Hosting emulator, alongside the
    // Firestore emulator the seeded search scenario queries. Firebase boots both
    // together, so Firestore is ready by the time Hosting answers on `url`.
    command: "npm run build && npm run emulators:e2e",
    url: baseURL,
    reuseExistingServer: !isCI,
    // Allow extra time: the build plus a first-run Firestore emulator download
    // can exceed the previous hosting-only budget.
    timeout: 180 * 1000,
  },
});
