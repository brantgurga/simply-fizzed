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
  moderator: false,
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
    expect(saver).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

    await interaction.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saver).toHaveBeenCalledWith({ targetUid: "fan-uid", moderator: true });
    expect(await screen.findByText("User changes were applied.")).toBeVisible();
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
