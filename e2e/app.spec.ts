import { expect, test } from "@playwright/test";
import { INDIANAPOLIS, KROGER, TIMS_BREWERY } from "./fixtures.ts";

test.describe("App", () => {
  test("renders the app title", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
  });

  test("prompts guests to sign up before contributing a location", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "The authentication flow is exercised once in Chromium.");
    await page.goto("/");

    await page.getByRole("button", { name: "Add a location" }).click();

    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to browsing" })).toBeVisible();

    await page
      .getByLabel(/email address/i)
      .fill(`contributor-${testInfo.retry.toString()}@example.test`);
    await page.getByLabel(/password/i).fill("emulator-password");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByRole("heading", { name: "Add a soda location" })).toBeVisible();
    await expect(page.getByLabel("Location name")).toBeVisible();
  });

  test("signs in with the Auth emulator and restores the session offline", async ({
    page,
    context,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "Auth persistence is exercised once in Chromium.");
    const email = `offline-fan-retry-${testInfo.retry.toString()}@example.test`;

    await page.route(/https:\/\/.*(?:firebaseapp|firebaseio|googleapis)\.com/, (route) =>
      route.abort(),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: /sign up/i }).click();
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/password/i).fill("emulator-password");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(email)).toBeVisible();
    await page.evaluate("navigator.serviceWorker.ready");
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();
    await context.setOffline(false);
  });

  test("is installable and keeps loaded search results available offline", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Offline persistence is exercised once in Chromium.");

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(INDIANAPOLIS);
    await page.goto("/");

    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    expect(await manifestResponse.json()).toMatchObject({
      display: "standalone",
      name: "Simply Fizzed",
      start_url: "/",
    });

    await expect(page.getByRole("heading", { name: KROGER.name })).toBeVisible();
    await page.evaluate("navigator.serviceWorker.ready");
    await page.reload();
    await expect(page.getByRole("heading", { name: KROGER.name })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: KROGER.name })).toBeVisible();
    await context.setOffline(false);
  });

  test("restores a manual search center while offline", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Offline persistence is exercised once in Chromium.");

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    });
    await page.goto("/");
    await page.getByLabel("City or postal code").fill("Indianapolis");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("Searching near 39.0997, -94.5786.")).toBeVisible();
    await expect(page.getByText(/No soda found within/)).toBeVisible();
    await page.evaluate("navigator.serviceWorker.ready");
    await page.reload();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("Searching near 39.0997, -94.5786.")).toBeVisible();
    await expect(page.getByText(/No soda found within/)).toBeVisible();
    await context.setOffline(false);
  });

  test("lists seeded soda locations nearest-first with their sodas", async ({
    page,
    context,
    browserName,
  }) => {
    // Geolocation override is only dependable in Chromium; the seed and query
    // logic are browser-independent, so exercising it once is sufficient.
    test.skip(browserName !== "chromium", "Geolocation override is only reliable in Chromium.");

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(INDIANAPOLIS);
    await page.goto("/");

    // Location names are the only level-2 headings; their DOM order is the
    // nearest-first sort. Kroger sits at the search point, Tim's Brewery ~14
    // miles north, so Kroger must come first.
    const locationNames = page.getByRole("heading", { level: 2 });
    await expect(locationNames).toHaveText([KROGER.name, TIMS_BREWERY.name]);

    const krogerCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: KROGER.name }) });
    await expect(krogerCard.getByText("Big K Root Beer in cans")).toBeVisible();
    await expect(krogerCard.getByText("Coca-Cola Classic in cans")).toBeVisible();
    await expect(krogerCard.getByText("0.0 miles away")).toBeVisible();

    const timsCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: TIMS_BREWERY.name }) });
    await expect(timsCard.getByText("Tim's Root Beer on draft")).toBeVisible();
    await expect(timsCard.getByText(/miles away/)).toBeVisible();
  });
});
