// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComingSoon from "./ComingSoon";

describe("ComingSoon", () => {
  it("renders a static placeholder instead of the app shell", () => {
    render(<ComingSoon />);

    expect(screen.getByRole("heading", { name: "Simply Fizzed" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
  });
});
