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
      canSample: "yes",
      canPurchase: "no",
      updatedAt: new Date("2026-09-26T12:00:00Z"),
    },
  ],
  malformedCount: 0,
  latestUpdatedAt: new Date("2026-09-26T12:00:00Z"),
});
const verificationLoader = vi.fn().mockResolvedValue({ malformedCount: 0 });

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
        verificationLoader={verificationLoader}
      />,
    );

    expect(await screen.findByRole("heading", { name: location.name })).toBeVisible();
    expect(screen.getByRole("link", { name: "Coca-Cola Cola (Original) in cans" })).toHaveAttribute(
      "href",
      "#/sodas/cola%2Fexact",
    );
    expect(screen.getByText("Can sample: Yes")).toBeVisible();
    expect(screen.getByText("Can purchase: No")).toBeVisible();
    expect(screen.getByText(/Last verified:\s*Never/)).toBeVisible();
    expect(locationLoader).toHaveBeenCalledWith(location.id);
    expect(availabilityLoader).toHaveBeenCalledWith(location.id);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("edits details and explicitly confirms without coupling the actions", async () => {
    const interaction = userEvent.setup();
    const signedInUser = { uid: "fan-123", displayName: "Soda Fan", email: null };
    const verification = {
      locationId: location.id,
      verifiedBy: "older-fan",
      verifiedByName: "Earlier Fan",
      verifiedAt: new Date("2026-09-25T12:00:00Z"),
    };
    const updated = {
      ...(await availabilityLoader(location.id)).items[0]!,
      canSample: "no" as const,
      canPurchase: "yes" as const,
      updatedBy: signedInUser.uid,
      updatedByName: signedInUser.displayName,
      updatedAt: new Date("2026-09-26T13:00:00Z"),
    };
    let finishAvailabilityCommit: (() => void) | undefined;
    const availabilityCommit = new Promise<void>((resolve) => {
      finishAvailabilityCommit = resolve;
    });
    const availabilityUpdater = vi.fn().mockReturnValue({
      value: updated,
      committed: availabilityCommit,
    });
    const confirmed = {
      locationId: location.id,
      verifiedBy: signedInUser.uid,
      verifiedByName: signedInUser.displayName,
      verifiedAt: new Date("2026-09-26T14:00:00Z"),
    };
    const verificationWriter = vi.fn().mockReturnValue({
      value: confirmed,
      committed: Promise.resolve(),
    });
    render(
      <LocationDetail
        locationId={location.id}
        user={signedInUser}
        onSignIn={vi.fn()}
        locationLoader={locationLoader}
        availabilityLoader={availabilityLoader}
        verificationLoader={vi.fn().mockResolvedValue({ latest: verification, malformedCount: 0 })}
        catalogLoader={vi.fn().mockResolvedValue([])}
        availabilityUpdater={availabilityUpdater}
        verificationWriter={verificationWriter}
      />,
    );

    expect(await screen.findByText(/by Earlier Fan/)).toBeVisible();
    expect(screen.getByText("Availability has changed since it was last verified.")).toBeVisible();
    await interaction.click(screen.getByRole("button", { name: "Edit availability details" }));
    await interaction.click(screen.getAllByLabelText("Can sample")[0]!);
    await interaction.click(screen.getByRole("option", { name: "No" }));
    await interaction.click(screen.getAllByLabelText("Can purchase")[0]!);
    await interaction.click(screen.getByRole("option", { name: "Yes" }));
    await interaction.click(screen.getByRole("button", { name: "Save details" }));

    expect(availabilityUpdater).toHaveBeenCalledWith(
      expect.objectContaining({ sodaId: "cola/exact" }),
      { canSample: "no", canPurchase: "yes" },
      signedInUser,
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(verificationWriter).not.toHaveBeenCalled();

    await interaction.click(screen.getByRole("button", { name: "Confirm availability" }));
    expect(verificationWriter).toHaveBeenCalledWith(location.id, signedInUser);
    expect(await screen.findByText(/by Soda Fan/)).toBeVisible();
    if (finishAvailabilityCommit === undefined) throw new Error("Missing commit resolver");
    finishAvailabilityCommit();
    expect(await screen.findByText("Can sample: No")).toBeVisible();
  });

  it("rolls back rejected detail edits and confirmations", async () => {
    const interaction = userEvent.setup();
    const signedInUser = { uid: "fan-123", displayName: "Soda Fan", email: null };
    const original = (await availabilityLoader(location.id)).items[0]!;
    const previousVerification = {
      locationId: location.id,
      verifiedBy: "older-fan",
      verifiedByName: "Earlier Fan",
      verifiedAt: new Date("2026-09-25T12:00:00Z"),
    };
    const rejectedUpdate = {
      ...original,
      canSample: "no" as const,
      updatedAt: new Date("2026-09-26T13:00:00Z"),
    };
    const rejectedVerification = {
      locationId: location.id,
      verifiedBy: signedInUser.uid,
      verifiedByName: signedInUser.displayName,
      verifiedAt: new Date("2026-09-26T14:00:00Z"),
    };
    render(
      <LocationDetail
        locationId={location.id}
        user={signedInUser}
        onSignIn={vi.fn()}
        locationLoader={locationLoader}
        availabilityLoader={availabilityLoader}
        verificationLoader={vi
          .fn()
          .mockResolvedValue({ latest: previousVerification, malformedCount: 0 })}
        catalogLoader={vi.fn().mockResolvedValue([])}
        availabilityUpdater={vi.fn().mockImplementation(() => ({
          value: rejectedUpdate,
          committed: Promise.reject(new Error("denied")),
        }))}
        verificationWriter={vi.fn().mockImplementation(() => ({
          value: rejectedVerification,
          committed: Promise.reject(new Error("denied")),
        }))}
      />,
    );

    await screen.findByRole("heading", { name: location.name });
    await interaction.click(screen.getByRole("button", { name: "Edit availability details" }));
    await interaction.click(screen.getAllByLabelText("Can sample")[0]!);
    await interaction.click(screen.getByRole("option", { name: "No" }));
    await interaction.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByText(/could not be synchronized/i)).toBeVisible();
    await interaction.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Can sample: Yes")).toBeVisible();

    await interaction.click(screen.getByRole("button", { name: "Confirm availability" }));
    expect(await screen.findByText(/by Earlier Fan/)).toBeVisible();
    expect(
      screen.queryByText("Availability confirmation saved on this device."),
    ).not.toBeInTheDocument();
  });

  it("removes a rejected optimistic addition so it can be retried", async () => {
    const interaction = userEvent.setup();
    const signedInUser = { uid: "fan-123", displayName: "Soda Fan", email: null };
    const soda = {
      id: "sprecher-root-beer",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Original",
    };
    let rejectCommit: ((error: Error) => void) | undefined;
    const committed = new Promise<void>((_resolve, reject) => {
      rejectCommit = reject;
    });
    const writer = vi.fn().mockReturnValue({
      value: {
        soda,
        availability: {
          locationId: location.id,
          sodaId: soda.id,
          form: "can",
          sodaName: soda.name,
          sodaBrand: soda.brand,
          sodaFlavor: soda.flavor,
          canSample: "unknown",
          canPurchase: "unknown",
          updatedAt: new Date("2026-09-26T12:00:00Z"),
        },
      },
      committed,
    });
    render(
      <LocationDetail
        locationId={location.id}
        user={signedInUser}
        onSignIn={vi.fn()}
        locationLoader={locationLoader}
        availabilityLoader={vi.fn().mockResolvedValue({ items: [], malformedCount: 0 })}
        verificationLoader={verificationLoader}
        catalogLoader={vi.fn().mockResolvedValue([])}
        newSodaAvailabilityWriter={writer}
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
    if (rejectCommit === undefined) throw new Error("Missing commit rejecter");
    rejectCommit(new Error("denied"));

    expect(await screen.findByText(/could not be synchronized/i)).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Sprecher Root Beer (Original) in cans" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add soda" })).toBeEnabled();
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
    let finishAvailabilityCommit: (() => void) | undefined;
    const availabilityCommit = new Promise<void>((resolve) => {
      finishAvailabilityCommit = resolve;
    });
    const newSodaAvailabilityWriter = vi.fn().mockReturnValue({
      value: {
        soda,
        availability: {
          locationId: location.id,
          sodaId: soda.id,
          form: "can",
          sodaName: soda.name,
          sodaBrand: soda.brand,
          sodaFlavor: soda.flavor,
          canSample: "unknown",
          canPurchase: "unknown",
          updatedAt: new Date("2026-09-26T12:00:00Z"),
        },
      },
      committed: availabilityCommit,
    });
    render(
      <LocationDetail
        locationId={location.id}
        user={signedInUser}
        onSignIn={vi.fn()}
        locationLoader={locationLoader}
        availabilityLoader={vi.fn().mockResolvedValue({ items: [], malformedCount: 0 })}
        verificationLoader={verificationLoader}
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
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
    expect(newSodaAvailabilityWriter).toHaveBeenCalledWith(
      location.id,
      { brand: "Sprecher", name: "Root Beer", flavor: "Original" },
      "can",
      { canSample: "unknown", canPurchase: "unknown" },
      signedInUser,
    );
    if (finishAvailabilityCommit === undefined) throw new Error("Missing commit resolver");
    finishAvailabilityCommit();
    expect(await screen.findByText("Availability added.")).toBeVisible();
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
        verificationLoader={verificationLoader}
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
        verificationLoader={verificationLoader}
      />,
    );

    expect(await screen.findByText(/could not be loaded/i)).toBeVisible();
  });
});
