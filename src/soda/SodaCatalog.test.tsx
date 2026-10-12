// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SodaCatalog from "./SodaCatalog";

const loader = vi.fn().mockResolvedValue({
  locations: [],
  items: [
    {
      id: "sprecher-root",
      brand: "Sprecher",
      name: "Root Beer",
      flavor: "Root Beer",
      averageRating: 4.5,
      ratingCount: 8,
      tried: false,
      availability: [],
    },
    {
      id: "lemon-up",
      brand: "7-Up",
      name: "Lemon-Up",
      flavor: "Lemon-Lime",
      ratingCount: 0,
      tried: false,
      availability: [],
    },
  ],
});

describe("SodaCatalog", () => {
  it("renders compact catalog entries with rating evidence", async () => {
    render(<SodaCatalog parameters={new URLSearchParams()} loader={loader} />);

    expect(await screen.findByRole("heading", { name: "Soda varieties" })).toBeVisible();
    expect(screen.getByText("4.5 mugs (8 ratings)")).toBeVisible();
    expect(screen.getByText("Not yet rated")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Sprecher Root Beer Root Beer 4.5 mugs/i }),
    ).toHaveAttribute("href", "#/sodas/sprecher-root");
  });

  it("filters the same soda by terms from different fields", async () => {
    render(
      <SodaCatalog parameters={new URLSearchParams({ q: "sprecher root" })} loader={loader} />,
    );

    expect(await screen.findByText("1 matching soda variety")).toBeVisible();
    expect(screen.queryByText("Lemon-Up")).not.toBeInTheDocument();
  });

  it("disables and ignores personal tried filtering for guests", async () => {
    render(
      <SodaCatalog parameters={new URLSearchParams({ tried: "not-tried" })} loader={loader} />,
    );
    expect(await screen.findByText("2 matching soda varieties")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Tried" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
