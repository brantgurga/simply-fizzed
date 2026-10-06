// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStartupContent } from "./startup";

const isFullAppEnabled = vi.hoisted(() => vi.fn());

vi.mock("./firebase", () => ({ isFullAppEnabled }));
vi.mock("./App", () => ({ default: () => <p>Full application</p> }));

describe("getStartupContent", () => {
  beforeEach(() => {
    isFullAppEnabled.mockReset();
  });

  it("loads the full application for an enabled hostname", async () => {
    isFullAppEnabled.mockResolvedValue(true);

    const Content = await getStartupContent("staging.example.com");
    render(<Content />);

    expect(isFullAppEnabled).toHaveBeenCalledWith("staging.example.com");
    expect(screen.getByText("Full application")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Coming soon" })).not.toBeInTheDocument();
  });

  it("renders the placeholder for a disabled hostname", async () => {
    isFullAppEnabled.mockResolvedValue(false);

    const Content = await getStartupContent("www.example.com");
    render(<Content />);

    expect(isFullAppEnabled).toHaveBeenCalledWith("www.example.com");
    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    expect(screen.queryByText("Full application")).not.toBeInTheDocument();
  });
});
