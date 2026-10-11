// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientAuthorization } from "../authorization";
import type { ManagedUser } from "./api";
import UserManagement from "./UserManagement";

const authorization: ClientAuthorization = {
  moderator: false,
  operator: true,
  restricted: false,
  canWriteCommunity: true,
  canManageUsers: true,
  evaluatedAt: "2026-10-03T12:00:00.000Z",
  restriction: null,
  source: "server",
};

const managedFan: ManagedUser = {
  uid: "fan-uid",
  displayName: "Fiona Fan",
  obfuscatedEmail: "fa…@example.com",
  disabled: false,
  moderator: false,
  auditVersion: 0,
  canManage: true,
  restriction: null,
};

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

describe("UserManagement", () => {
  beforeEach(() => {
    setOnline(true);
    window.localStorage.clear();
  });

  it("searches explicitly and reveals email only in component memory", async () => {
    const interaction = userEvent.setup();
    const searcher = vi.fn().mockResolvedValue([managedFan]);
    const revealer = vi.fn().mockResolvedValue("fan.person@example.com");
    const view = render(
      <UserManagement
        authorization={authorization}
        searcher={searcher}
        revealer={revealer}
        saver={vi.fn()}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Fiona");
    expect(searcher).not.toHaveBeenCalled();
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Fiona Fan"));
    expect(screen.getAllByText(/fa…@example\.com/)).toHaveLength(2);
    expect(screen.queryByText("fan.person@example.com")).not.toBeInTheDocument();

    await interaction.click(screen.getByRole("button", { name: "Reveal full email" }));
    expect(await screen.findByText(/fan\.person@example\.com/)).toBeVisible();
    expect(revealer).toHaveBeenCalledWith("fan-uid");
    expect(JSON.stringify(window.localStorage)).not.toContain("fan.person@example.com");

    view.unmount();
    render(
      <UserManagement
        authorization={authorization}
        searcher={searcher}
        revealer={revealer}
        saver={vi.fn()}
      />,
    );
    expect(screen.queryByText("fan.person@example.com")).not.toBeInTheDocument();
  });

  it("discards a pending email reveal after selecting another user", async () => {
    const interaction = userEvent.setup();
    const secondFan: ManagedUser = {
      ...managedFan,
      uid: "second-fan-uid",
      displayName: "Finn Fan",
      obfuscatedEmail: "fi…@example.com",
    };
    let resolveEmail!: (email: string) => void;
    const revealer = vi.fn(
      async () =>
        await new Promise<string>((resolve) => {
          resolveEmail = resolve;
        }),
    );
    render(
      <UserManagement
        authorization={authorization}
        searcher={vi.fn().mockResolvedValue([managedFan, secondFan])}
        revealer={revealer}
        saver={vi.fn()}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Fan");
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Fiona Fan"));
    await interaction.click(screen.getByRole("button", { name: "Reveal full email" }));
    await interaction.click(screen.getByText("Finn Fan"));
    await act(async () => {
      resolveEmail("fan.person@example.com");
      await Promise.resolve();
    });

    expect(screen.queryByText("fan.person@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByText(/fi…@example\.com/)).toHaveLength(2);
  });

  it("stages role and restriction changes until explicit Save", async () => {
    const interaction = userEvent.setup();
    const saver = vi.fn().mockResolvedValue({ ...managedFan, moderator: true });
    render(
      <UserManagement
        authorization={authorization}
        searcher={vi.fn().mockResolvedValue([managedFan])}
        revealer={vi.fn()}
        saver={saver}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Fiona");
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Fiona Fan"));
    await interaction.click(screen.getByRole("switch", { name: "Moderator" }));
    expect(screen.getByRole("switch", { name: "Moderator" })).toBeChecked();
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await interaction.type(screen.getByLabelText(/Action reason/), "Trusted contributor");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    await interaction.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saver).toHaveBeenCalledWith({
      targetUid: "fan-uid",
      expectedVersion: 0,
      reason: "Trusted contributor",
      moderator: true,
    });
    expect(await screen.findByText("User changes were applied.")).toBeVisible();
  });

  it("shows history without management controls for an inspect-only user", async () => {
    const interaction = userEvent.setup();
    const operatorUser: ManagedUser = {
      ...managedFan,
      uid: "operator-uid",
      displayName: "Opal Operator",
      canManage: false,
    };
    render(
      <UserManagement
        authorization={{ ...authorization, operator: false, moderator: true }}
        searcher={vi.fn().mockResolvedValue([operatorUser])}
        revealer={vi.fn()}
        historyLoader={vi.fn().mockResolvedValue({ events: [], identities: [], version: 1 })}
        saver={vi.fn()}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Opal");
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Opal Operator"));

    expect(await screen.findByText("User change history")).toBeVisible();
    expect(screen.queryByText("Restrict community contributions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reveal full email" })).not.toBeInTheDocument();
  });

  it("reports a failed older-history page without discarding loaded evidence", async () => {
    const interaction = userEvent.setup();
    const historyLoader = vi
      .fn()
      .mockResolvedValueOnce({
        events: [],
        identities: [],
        version: 1,
        nextBeforeSequence: 1,
      })
      .mockRejectedValueOnce(new Error("history unavailable"));
    render(
      <UserManagement
        authorization={authorization}
        searcher={vi.fn().mockResolvedValue([managedFan])}
        revealer={vi.fn()}
        historyLoader={historyLoader}
        saver={vi.fn()}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Fiona");
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Fiona Fan"));
    await interaction.click(await screen.findByRole("button", { name: "Load older history" }));

    expect(
      await screen.findByText("Older user history failed to load. Confirm connectivity and retry."),
    ).toBeVisible();
    expect(screen.getByText("No post-rollout user changes are recorded.")).toBeVisible();
    expect(historyLoader).toHaveBeenLastCalledWith("fan-uid", 1);
  });

  it("reloads confirmed state after a failed save and disables operations offline", async () => {
    const interaction = userEvent.setup();
    const searcher = vi
      .fn()
      .mockResolvedValueOnce([managedFan])
      .mockResolvedValueOnce([managedFan]);
    const saver = vi.fn().mockRejectedValue(new Error("denied"));
    render(
      <UserManagement
        authorization={authorization}
        searcher={searcher}
        revealer={vi.fn()}
        saver={saver}
      />,
    );

    await interaction.type(screen.getByLabelText("User search"), "Fiona");
    await interaction.click(screen.getByRole("button", { name: "Search" }));
    await interaction.click(await screen.findByText("Fiona Fan"));
    await interaction.click(screen.getByRole("switch", { name: "Moderator" }));
    await interaction.type(screen.getByLabelText(/Action reason/), "Role correction");
    await interaction.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/latest server state was reloaded/i)).toBeVisible();
    expect(searcher).toHaveBeenLastCalledWith("uid", "fan-uid");
    expect(screen.getByRole("switch", { name: "Moderator" })).not.toBeChecked();

    setOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(await screen.findByText(/online-only/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reveal full email" })).toBeDisabled();
  });
});
