import { expect, test } from "@playwright/test";
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { INDIANAPOLIS, KROGER, SODAS, TIMS_BREWERY } from "./fixtures.ts";

const PROJECT_ID = "demo-simply-fizzed";
let cleanupAppNumber = 0;

async function deleteLocationsNamed(...names: string[]): Promise<void> {
  process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080";
  const app = initializeAdminApp(
    { projectId: PROJECT_ID },
    `location-cleanup-${cleanupAppNumber.toString()}`,
  );
  cleanupAppNumber += 1;

  try {
    const db = getAdminFirestore(app);
    const snapshots = await Promise.all(
      names.map((name) => db.collection("locations").where("name", "==", name).get()),
    );
    await Promise.all(
      snapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref.delete())),
    );
  } finally {
    await deleteAdminApp(app);
  }
}

async function deleteAvailability(id: string): Promise<void> {
  process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080";
  const app = initializeAdminApp(
    { projectId: PROJECT_ID },
    `availability-cleanup-${cleanupAppNumber.toString()}`,
  );
  cleanupAppNumber += 1;
  try {
    await getAdminFirestore(app).collection("availability").doc(id).delete();
  } finally {
    await deleteAdminApp(app);
  }
}

test.describe("App", () => {
  test.describe.configure({ mode: "serial" });

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

    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to browsing" })).toBeVisible();

    await page
      .getByLabel(/email address/i)
      .fill(`contributor-${testInfo.retry.toString()}@example.com`);
    await page.getByLabel(/password/i).fill("emulator-password");
    await page.getByRole("button", { name: /create account/i }).click();

    const locationName = `Test Soda Shop ${testInfo.retry.toString()}`;
    try {
      await expect(page.getByRole("heading", { name: "Add a soda location" })).toBeVisible();
      await page.getByLabel("Location name").fill(locationName);
      await page.getByLabel("Street address").fill("123 Test Street");
      await page.getByLabel("City").fill("Indianapolis");
      await page.getByLabel("State").fill("IN");
      await page.getByLabel("Postal code").fill("46204");
      await page.getByRole("button", { name: "Add location" }).click();

      await expect(page.getByText(`Thanks — ${locationName} was added.`)).toBeVisible();
    } finally {
      await deleteLocationsNamed(locationName);
    }
  });

  test("enforces location creation rules for authenticated fans", async ({
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "Firestore rules are exercised once in Chromium.");
    const app = initializeApp(
      { apiKey: "demo-api-key", projectId: PROJECT_ID },
      `rules-${testInfo.retry.toString()}`,
    );
    const validName = "Rules Test Shop";
    const invalidNames = [" \t", "\u00a0"];

    try {
      const auth = getAuth(app);
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      const credential = await createUserWithEmailAndPassword(
        auth,
        `rules-fan-${testInfo.retry.toString()}@example.com`,
        "emulator-password",
      );
      const db = getFirestore(app);
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      const contributorName = credential.user.email ?? "Rules test fan";
      const validLocation = {
        name: validName,
        address: {
          street: "123 Test Street",
          city: "Indianapolis",
          state: "IN",
          postalCode: "46204",
        },
        geo: { lat: 39.7684, lng: -86.1581 },
        geohash: "dp4dpr",
        createdBy: credential.user.uid,
        createdByName: contributorName,
        createdAt: serverTimestamp(),
        updatedBy: credential.user.uid,
        updatedByName: contributorName,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "locations", `valid-${testInfo.retry.toString()}`), validLocation);

      const invalidWriteErrors = await Promise.all(
        invalidNames.map(async (invalidName, index): Promise<unknown> => {
          try {
            await setDoc(
              doc(db, "locations", `blank-${testInfo.retry.toString()}-${index.toString()}`),
              {
                ...validLocation,
                name: invalidName,
              },
            );
            return undefined;
          } catch (error) {
            return error;
          }
        }),
      );
      for (const invalidWriteError of invalidWriteErrors) {
        expect(invalidWriteError).toMatchObject({ code: "permission-denied" });
      }
    } finally {
      await Promise.all([deleteLocationsNamed(validName, ...invalidNames), deleteApp(app)]);
    }
  });

  test("signs in with the Auth emulator and restores the session offline", async ({
    page,
    context,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "Auth persistence is exercised once in Chromium.");
    const email = `offline-fan-retry-${testInfo.retry.toString()}@example.com`;

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

  test("loads exact location and soda hash routes", async ({ page }) => {
    const cocaCola = SODAS.find((soda) => soda.id === "coca-cola");
    if (cocaCola === undefined) throw new Error("Missing Coca-Cola fixture");

    await page.goto(`/#/locations/${KROGER.id}`);

    await expect(page.getByRole("heading", { name: KROGER.name })).toBeVisible();
    const sodaLink = page.getByRole("link", { name: "Coca-Cola Cola (Original) in cans" });
    await expect(sodaLink).toHaveAttribute("href", "#/sodas/coca-cola");
    await sodaLink.click();
    await expect(
      page.getByRole("heading", { name: `${cocaCola.brand} ${cocaCola.name}` }),
    ).toBeVisible();
    await expect(page.getByText("Coke", { exact: true })).toBeVisible();
  });

  test("rates a soda and exposes the public sampling inventory", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "The authenticated sampling flow is exercised once.");
    const email = `sampling-${testInfo.retry.toString()}@example.com`;
    await page.goto("/#/sodas/coca-cola");

    await page.getByRole("button", { name: "Sign in to track this soda" }).click();
    await page.getByRole("button", { name: /sign up/i }).click();
    await page.getByLabel(/email address/i).fill(email);
    await page.getByLabel(/password/i).fill("emulator-password");
    await page.getByRole("button", { name: /create account/i }).click();

    const fourMugs = page.getByRole("radio", { name: "4 mugs: Really liked" });
    const fourMugsId = await fourMugs.getAttribute("id");
    if (fourMugsId === null) throw new Error("Missing rating input ID");
    await page.locator(`label[for="${fourMugsId}"]`).click();
    await expect(page.getByRole("button", { name: "Clear rating" })).toBeEnabled();
    await page.getByRole("link", { name: email }).click();
    await expect(page.getByRole("heading", { name: "sa…@example.com" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Coca-Cola Cola" })).toBeVisible();
    await expect(page.getByLabel("Coca-Cola Cola: 4 mugs")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "sa…@example.com" })).toBeVisible();
  });

  test("requires an exact ambiguous soda selection before contributing", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "The authenticated contribution is exercised once.");
    const pepsi = SODAS.find((soda) => soda.id === "pepsi-cola");
    if (pepsi === undefined) throw new Error("Missing Pepsi fixture");
    const availabilityId = `${encodeURIComponent(KROGER.id)}$${encodeURIComponent(pepsi.id)}$bottle`;

    await page.goto(`/#/locations/${KROGER.id}`);
    await expect(page.getByText("Sign in to contribute soda availability.")).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await page.getByRole("button", { name: /sign up/i }).click();
    await page
      .getByLabel(/email address/i)
      .fill(`availability-${testInfo.retry.toString()}@example.com`);
    await page.getByLabel(/password/i).fill("emulator-password");
    await page.getByRole("button", { name: /create account/i }).click();

    try {
      const sodaInput = page.getByLabel("Catalog soda");
      await expect(sodaInput).toBeVisible();
      await sodaInput.fill("Coke");
      const options = page.getByRole("option");
      await expect(options).toHaveCount(2);
      await page.getByRole("option", { name: "Pepsi-Cola Cola — Original" }).click();
      await page.getByLabel("Form").click();
      await page.getByRole("option", { name: "Bottle" }).click();
      await page.getByRole("button", { name: "Add soda" }).click();

      await expect(
        page.getByRole("link", { name: "Pepsi-Cola Cola (Original) in bottles" }),
      ).toBeVisible();
    } finally {
      await deleteAvailability(availabilityId);
    }
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
    await expect(krogerCard.getByText("Coca-Cola Cola (Original) in cans")).toBeVisible();
    await expect(krogerCard.getByText("0.0 miles away")).toBeVisible();

    const timsCard = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: TIMS_BREWERY.name }) });
    await expect(timsCard.getByText("Tim's Root Beer on draft")).toBeVisible();
    await expect(timsCard.getByText(/miles away/)).toBeVisible();
  });
});
