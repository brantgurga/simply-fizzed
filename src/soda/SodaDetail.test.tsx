import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SodaDetail from "./SodaDetail";

describe("SodaDetail", () => {
  it("renders canonical fields, aliases, and update attribution", async () => {
    const loader = vi.fn().mockResolvedValue({
      status: "found",
      value: {
        id: "coke-zero",
        brand: "Coca-Cola",
        name: "Zero Sugar",
        flavor: "Cola",
        aliases: ["Coke Zero", "Coca-Cola Zero"],
        updatedByName: "Soda Fan",
        updatedAt: new Date("2026-09-23T02:48:11Z"),
      },
    });
    render(<SodaDetail sodaId="coke-zero" loader={loader} />);

    expect(await screen.findByRole("heading", { name: "Coca-Cola Zero Sugar" })).toBeVisible();
    expect(screen.getByText("Coke Zero")).toBeVisible();
    expect(screen.getByText("Soda Fan")).toBeVisible();
    expect(screen.getByText(/2026/)).toBeVisible();
    expect(loader).toHaveBeenCalledWith("coke-zero");
  });

  it("styles missing attribution differently from a contributor named Unknown", async () => {
    const loader = vi.fn().mockResolvedValue({
      status: "found",
      value: {
        id: "legacy",
        brand: "Brand",
        name: "Name",
        flavor: "Flavor",
        updatedByName: "Unknown",
      },
    });

    render(<SodaDetail sodaId="legacy" loader={loader} />);

    expect(await screen.findByRole("heading", { name: "Brand Name" })).toBeVisible();
    const unknownValues = screen.getAllByText("Unknown");
    expect(unknownValues).toHaveLength(2);
    expect(unknownValues.filter((value) => value.style.fontStyle === "italic")).toHaveLength(1);
  });

  it.each([
    ["missing", "could not be found"],
    ["malformed", "malformed catalog data"],
  ] as const)("renders the %s state", async (status, message) => {
    render(<SodaDetail sodaId="bad" loader={vi.fn().mockResolvedValue({ status })} />);

    expect(await screen.findByText(new RegExp(message, "i"))).toBeVisible();
  });

  it("renders load errors", async () => {
    render(<SodaDetail sodaId="bad" loader={vi.fn().mockRejectedValue(new Error("offline"))} />);

    expect(await screen.findByText(/could not be loaded/i)).toBeVisible();
  });
});
