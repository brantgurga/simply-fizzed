import { defineConfig, devices } from "@playwright/test";

// Keep browser binaries hermetic (under node_modules) so they stay on the same
// drive as the repo. Must match the value used at `playwright install` time.
process.env["PLAYWRIGHT_BROWSERS_PATH"] ??= "0";

const isCI = !!process.env["CI"];
const PORT = 4173;
const baseURL = `http://localhost:${PORT}`;

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
    command: "npm run build && npm run preview",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120 * 1000,
  },
});
