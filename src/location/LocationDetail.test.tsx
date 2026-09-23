import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LocationDetail from "./LocationDetail";

const location = {
  id: "shop/one",
  name: "Corner Shop",
  address: { street: "1 Main St", city: "Indy", state: "IN", postalCode: "46204" },
  geo: { lat: 39.7, lng: -86.1 },
  geohash: "dp4",
};

const locationLoader = vi.fn().mockResolvedValue({ status: "found", value: location });
const availabilityLoader = vi.fn().mockResolvedValue({
  items: [
    {
      locationId: location.id,
      sodaId: "cola/exact",
      form: "can",
      sodaName: "Cola",
      sodaBrand: "Coca-Cola",
      sodaFlavor: "Original",
    },
  ],
  malformedCount: 0,
});

describe("LocationDetail", () => {
  it("loads independently, links exact sodas, and prompts guests to sign in", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(
      <LocationDetail
        locationId={location.id}
        user={null}
        onSignIn={onSignIn}
        locationLoader={locationLoader}
        availabilityLoader={availabilityLoader}
      />,
    );

    expect(await screen.findByRole("heading", { name: location.name })).toBeVisible();
    expect(screen.getByRole("link", { name: "Coca-Cola Cola (Original) in cans" })).toHaveAttribute(
      "href",
      "#/sodas/cola%2Fexact",
    );
    expect(locationLoader).toHaveBeenCalledWith(location.id);
    expect(availabilityLoader).toHaveBeenCalledWith(location.id);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("adds a new soda and immediately lists its availability", async () => {
    const interaction = userEvent.setup();
    const signedInUser = { uid: "fan-123", displayName: "Soda Fan", email: null };
    const soda = {
      id: "sprecher-root-beer",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Original",
    };
    const newSodaAvailabilityWriter = vi.fn().mockResolvedValue({
      soda,
      availability: {
        locationId: location.id,
        sodaId: soda.id,
        form: "can",
        sodaName: soda.name,
        sodaBrand: soda.brand,
        sodaFlavor: soda.flavor,
      },
    });
    render(
      <LocationDetail
        locationId={location.id}
        user={signedInUser}
        onSignIn={vi.fn()}
        locationLoader={locationLoader}
        availabilityLoader={vi.fn().mockResolvedValue({ items: [], malformedCount: 0 })}
        catalogLoader={vi.fn().mockResolvedValue([])}
        newSodaAvailabilityWriter={newSodaAvailabilityWriter}
      />,
    );

    const input = await screen.findByLabelText("Catalog soda");
    await interaction.type(input, "Root Beer");
    await interaction.click(screen.getByRole("button", { name: /add “root beer” as a new soda/i }));
    await interaction.type(screen.getByLabelText("Brand"), "Sprecher");
    await interaction.click(screen.getByRole("button", { name: "Add soda" }));

    expect(
      await screen.findByRole("link", { name: "Sprecher Root Beer (Original) in cans" }),
    ).toBeVisible();
    expect(newSodaAvailabilityWriter).toHaveBeenCalledWith(
      location.id,
      { brand: "Sprecher", name: "Root Beer", flavor: "Original" },
      "can",
      signedInUser,
    );
  });

  it.each([
    ["missing", "could not be found"],
    ["malformed", "malformed data"],
  ] as const)("renders a %s location", async (status, message) => {
    render(
      <LocationDetail
        locationId="bad"
        user={null}
        onSignIn={vi.fn()}
        locationLoader={vi.fn().mockResolvedValue({ status })}
        availabilityLoader={vi.fn().mockResolvedValue({ items: [], malformedCount: 0 })}
      />,
    );

    expect(await screen.findByText(new RegExp(message, "i"))).toBeVisible();
  });

  it("renders load errors", async () => {
    render(
      <LocationDetail
        locationId="offline"
        user={null}
        onSignIn={vi.fn()}
        locationLoader={vi.fn().mockRejectedValue(new Error("offline"))}
        availabilityLoader={vi.fn().mockResolvedValue({ items: [], malformedCount: 0 })}
      />,
    );

    expect(await screen.findByText(/could not be loaded/i)).toBeVisible();
  });
});
