// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuditHistory as AuditHistoryData } from "./api";
import AuditHistory from "./AuditHistory";

const snapshot = {
  auth: {
    disabled: false,
    displayName: "Fiona Fan",
    email: "fan@example.com",
    hasProfileImage: false,
    moderator: false,
  },
  profile: { publicName: "Fiona" },
  restriction: null,
};

const history: AuditHistoryData = {
  version: 2,
  identities: [
    { uid: "fan-uid", displayName: "Fiona Fan", email: "fan@example.com", unavailable: false },
    { uid: "deleted-uid", displayName: null, email: null, unavailable: true },
  ],
  events: [
    {
      id: "newer",
      actor: { kind: "user", uid: "deleted-uid" },
      subjectUid: "fan-uid",
      type: "user.restricted",
      sequence: 2,
      occurredAt: "2026-10-03T12:00:00.000Z",
      before: { ...snapshot, profile: { publicName: "Unobserved" } },
      after: {
        ...snapshot,
        restriction: {
          internalReason: "Repeated abuse",
          publicReason: "Please pause contributions",
        },
      },
      reason: "Moderator action with full context",
      changedFields: ["restriction"],
    },
    {
      id: "older",
      actor: { kind: "system", id: "firebase-auth" },
      subjectUid: "fan-uid",
      type: "account.created",
      sequence: 1,
      occurredAt: "2026-10-01T12:00:00.000Z",
      before: null,
      after: snapshot,
    },
  ],
};

describe("AuditHistory", () => {
  it("shows newest-first details, unresolved identities, and deep JSON evidence", async () => {
    const interaction = userEvent.setup();
    render(<AuditHistory history={history} />);

    const headings = screen.getAllByRole("heading", { level: 6 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Restricted",
      "Account created",
    ]);
    expect(screen.getByText("Action reason: Moderator action with full context")).toBeVisible();
    expect(screen.getByText("Internal restriction reason: Repeated abuse")).toBeVisible();
    expect(
      screen.getByText("User-visible restriction reason: Please pause contributions"),
    ).toBeVisible();
    expect(screen.getByText(/Deleted or unavailable user · deleted-uid/)).toBeVisible();
    expect(screen.getByText(/unexplained break exists/i)).toBeVisible();

    await interaction.click(screen.getAllByText("Inspect before and after snapshots")[0]!);
    expect(screen.getAllByText("Before")[0]).toBeVisible();
    expect(screen.getByRole("tree", { name: "Before audit snapshot" })).toBeVisible();
    expect(screen.getByRole("tree", { name: "After audit snapshot" })).toBeVisible();
    expect(screen.getAllByText(/"displayName"/).length).toBeGreaterThan(0);
  });

  it("offers bounded pagination when older events remain", async () => {
    const interaction = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <AuditHistory history={{ ...history, nextBeforeSequence: 1 }} onLoadMore={onLoadMore} />,
    );

    await interaction.click(screen.getByRole("button", { name: "Load older history" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
