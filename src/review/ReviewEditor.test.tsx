// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReviewEditor from "./ReviewEditor";

const soda = { id: "cola", brand: "Fizz", name: "Cola", flavor: "Original" };
const fan = { uid: "fan-1", displayName: "Fiona", email: "fiona@example.test" };

describe("ReviewEditor", () => {
  it("offers accessible constrained formatting controls and a matching preview", async () => {
    const user = userEvent.setup();
    render(
      <ReviewEditor
        soda={soda}
        user={fan}
        hasPointRating
        canReview
        loader={vi.fn().mockResolvedValue({ status: "missing" })}
        saver={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Write a review" }));
    expect(screen.getByRole("group", { name: "Review formatting" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bold" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bulleted list" })).toBeEnabled();

    const input = screen.getByRole("textbox", { name: "Review" });
    await user.type(input, "Bright cola");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("Bright cola")).toBeVisible();
  });

  it("carries the latest optimistic approval into consecutive visible edits", async () => {
    const saver = vi
      .fn()
      .mockResolvedValueOnce({ markdown: "Great cola.", version: 2 })
      .mockResolvedValueOnce({ markdown: "Great cola.", version: 3 });
    const user = userEvent.setup();
    render(
      <ReviewEditor
        soda={soda}
        user={fan}
        hasPointRating
        canReview
        loader={vi.fn().mockResolvedValue({
          status: "found",
          value: {
            id: "cola",
            authorId: "fan-1",
            authorName: "Fiona",
            sodaOfferingId: "cola",
            sodaName: "Cola",
            sodaBrand: "Fizz",
            sodaFlavor: "Original",
            markdown: "Great cola.",
            contentLength: 11,
            version: 1,
            authoredAt: new Date("2026-01-01T00:00:00Z"),
            baseModerationCycle: 0,
            baseApprovedVersion: null,
            mutationId: "one",
            moderationStatus: "visible",
            moderationCycle: 0,
            approvedVersion: 1,
          },
        })}
        saver={saver}
      />,
    );

    const save = await screen.findByRole("button", { name: "Save review" });
    await user.click(save);
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => expect(saver).toHaveBeenCalledTimes(2));

    expect(saver.mock.calls[1]?.[3]).toEqual(expect.objectContaining({ approvedVersion: 2 }));
  });

  it("does not activate pasted links, images, or HTML", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReviewEditor
        soda={soda}
        user={fan}
        hasPointRating
        canReview
        loader={vi.fn().mockResolvedValue({ status: "missing" })}
        saver={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Write a review" }));
    const input = screen.getByRole("textbox", { name: "Review" });
    fireEvent.paste(input, {
      clipboardData: {
        getData: () => "[link](https://example.test) ![image](x) <img src=x>",
      },
    });
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(container.querySelector("a,img")).toBeNull();
    expect(screen.getByText(/link/)).toBeVisible();
  });
});
