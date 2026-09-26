import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { InventoryLoad, Sampling } from "../sampling/sampling";
import UserProfile from "./UserProfile";

function sampling(overrides: Partial<Sampling>): Sampling {
  return {
    id: "sample",
    userId: "fan-123",
    sodaOfferingId: "soda",
    sodaName: "Soda",
    sodaBrand: "Brand",
    sodaFlavor: "Original",
    rating: null,
    firstRecorded: new Date("2026-01-01T00:00:00Z"),
    lastRatedAt: null,
    ...overrides,
  };
}

const inventory: InventoryLoad = {
  status: "found",
  profile: {
    id: "fan-123",
    publicName: "fa…@example.com",
    updatedAt: new Date("2026-04-01T00:00:00Z"),
  },
  samplings: [
    sampling({
      id: "cola",
      sodaOfferingId: "cola",
      sodaName: "Cola",
      sodaBrand: "Alpha",
      rating: null,
      firstRecorded: new Date("2026-03-01T00:00:00Z"),
    }),
    sampling({
      id: "root-beer",
      sodaOfferingId: "root-beer",
      sodaName: "Root Beer",
      sodaBrand: "Zulu",
      rating: 5,
      lastRatedAt: new Date("2026-02-01T00:00:00Z"),
    }),
  ],
};

describe("UserProfile", () => {
  it("shows a public name plus rated and unrated sampled offerings", async () => {
    render(<UserProfile userId="fan-123" loader={vi.fn().mockResolvedValue(inventory)} />);

    expect(await screen.findByRole("heading", { name: "fa…@example.com" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Alpha Cola" })).toHaveAttribute(
      "href",
      "#/sodas/cola",
    );
    expect(screen.getByText("Unrated")).toBeVisible();
    expect(screen.getByLabelText("Zulu Root Beer: 5 mugs")).toBeVisible();
  });

  it("supports the recently rated ordering", async () => {
    const user = userEvent.setup();
    render(<UserProfile userId="fan-123" loader={vi.fn().mockResolvedValue(inventory)} />);

    expect(await screen.findByRole("link", { name: "Alpha Cola" })).toBeVisible();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Alpha Cola"),
      expect.stringContaining("Zulu Root Beer"),
    ]);

    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    await user.click(screen.getByRole("option", { name: "Recently rated" }));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Zulu Root Beer"),
      expect.stringContaining("Alpha Cola"),
    ]);
  });
});
