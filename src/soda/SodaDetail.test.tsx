import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("asks guests to sign in before tracking a soda", async () => {
    const onSignIn = vi.fn();
    const user = userEvent.setup();
    render(
      <SodaDetail
        sodaId="cola"
        loader={vi.fn().mockResolvedValue({
          status: "found",
          value: { id: "cola", brand: "Brand", name: "Cola", flavor: "Original" },
        })}
        onSignIn={onSignIn}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /sign in to track/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("reports a failed sampling save and restores the prior state", async () => {
    const user = userEvent.setup();
    render(
      <SodaDetail
        sodaId="cola"
        user={{ uid: "fan-123", displayName: "Fan", email: "fan@example.com" }}
        loader={vi.fn().mockResolvedValue({
          status: "found",
          value: { id: "cola", brand: "Brand", name: "Cola", flavor: "Original" },
        })}
        samplingLoader={vi.fn().mockResolvedValue({ status: "missing" })}
        samplingSaver={vi.fn().mockRejectedValue(new Error("offline"))}
      />,
    );

    const sampled = await screen.findByRole("checkbox", { name: "I've had this" });
    await user.click(sampled);
    expect(await screen.findByText(/could not be saved/i)).toBeVisible();
    expect(sampled).not.toBeChecked();
  });

  it("marks, rates, clears, and removes a sampling", async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <SodaDetail
        sodaId="cola"
        user={{ uid: "fan-123", displayName: null, email: "fan@example.com" }}
        loader={vi.fn().mockResolvedValue({
          status: "found",
          value: { id: "cola", brand: "Brand", name: "Cola", flavor: "Original" },
        })}
        samplingLoader={vi.fn().mockResolvedValue({ status: "missing" })}
        samplingSaver={saver}
      />,
    );

    const sampled = await screen.findByRole("checkbox", { name: "I've had this" });
    await user.click(sampled);
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        "fan-123",
        "fa…@example.com",
        expect.objectContaining({ id: "cola" }),
        null,
      ),
    );

    fireEvent.click(screen.getByRole("radio", { name: "4 mugs: Really liked" }));
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        "fan-123",
        "fa…@example.com",
        expect.objectContaining({ id: "cola" }),
        4,
      ),
    );

    await user.click(screen.getByRole("button", { name: "Clear rating" }));
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        "fan-123",
        "fa…@example.com",
        expect.objectContaining({ id: "cola" }),
        null,
      ),
    );

    await user.click(sampled);
    await waitFor(() =>
      expect(saver).toHaveBeenLastCalledWith(
        "fan-123",
        "fa…@example.com",
        expect.objectContaining({ id: "cola" }),
        undefined,
      ),
    );
  });
});
