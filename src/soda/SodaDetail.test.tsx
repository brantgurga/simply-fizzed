import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SodaDetail from "./SodaDetail";

describe("SodaDetail", () => {
  it("renders canonical fields and aliases from an exact document", async () => {
    const loader = vi.fn().mockResolvedValue({
      status: "found",
      value: {
        id: "coke-zero",
        brand: "Coca-Cola",
        name: "Zero Sugar",
        flavor: "Cola",
        aliases: ["Coke Zero", "Coca-Cola Zero"],
      },
    });
    render(<SodaDetail sodaId="coke-zero" loader={loader} />);

    expect(await screen.findByRole("heading", { name: "Coca-Cola Zero Sugar" })).toBeVisible();
    expect(screen.getByText("Coke Zero")).toBeVisible();
    expect(loader).toHaveBeenCalledWith("coke-zero");
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
