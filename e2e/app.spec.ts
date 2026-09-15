import { expect, test } from "@playwright/test";
import { INDIANAPOLIS, KROGER, TIMS_BREWERY } from "./fixtures.ts";

test.describe("App", () => {
  test("renders the app title", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
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
