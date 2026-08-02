import { expect, test } from "@playwright/test";

test.describe("App", () => {
  test("renders the getting-started heading", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  });

  test("increments the counter when the button is clicked", async ({ page }) => {
    await page.goto("/");

    const button = page.getByRole("button", { name: /count is 0/i });
    await button.click();

    await expect(page.getByRole("button", { name: /count is 1/i })).toBeVisible();
  });
});
