// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComingSoon from "./ComingSoon";
import PwaUpdatePrompt from "./PwaUpdatePrompt";

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(() => Promise.resolve()),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, pwa.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

describe("PwaUpdatePrompt", () => {
  beforeEach(() => {
    pwa.needRefresh = false;
    vi.clearAllMocks();
  });

  it("stays hidden when no update is waiting", () => {
    render(<PwaUpdatePrompt />);

    expect(screen.queryByText("A new version is available.")).not.toBeInTheDocument();
  });

  it("offers to activate a waiting update alongside Coming Soon content", async () => {
    pwa.needRefresh = true;
    const user = userEvent.setup();
    render(
      <>
        <ComingSoon />
        <PwaUpdatePrompt />
      </>,
    );

    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeVisible();
    expect(screen.getByText("A new version is available.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Dismiss update" }));
    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
  });
});
