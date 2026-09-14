import { expect, test } from "@playwright/test";

test.describe("App", () => {
  test("renders the app title", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
  });
});
