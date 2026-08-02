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
    command: "npm run build && npm run emulators:hosting",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120 * 1000,
  },
});
