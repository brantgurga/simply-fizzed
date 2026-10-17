// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModerationGrid } from "./ModerationPage";
import { PublicReviewList, ReviewCard } from "./ReviewList";
import type { PublishedReviewRecord } from "./reviews";

const review: PublishedReviewRecord = {
  id: "review-1",
  authorId: "fan-1",
  authorName: "Fiona Fan",
  sodaOfferingId: "cola",
  sodaName: "Cola",
  sodaBrand: "Fizz",
  sodaFlavor: "Original",
  markdown: "## Crisp\n\nA **bright** finish.",
  contentLength: 22,
  rating: 4,
  version: 2,
  moderationCycle: 1,
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  revisedAt: new Date("2026-02-01T00:00:00Z"),
};

describe("ReviewCard", () => {
  it("renders bounded public content and recognized structured review metadata", () => {
    const { container } = render(<ReviewCard review={review} showSoda />);

    const article = screen.getByRole("article");
    expect(article).toHaveAttribute("itemtype", "https://schema.org/Review");
    expect(article.querySelector('[itemprop="reviewBody"]')).not.toBeNull();
    expect(article.querySelector('[itemprop="ratingValue"]')).toHaveAttribute("content", "4");
    expect(article.querySelector('[itemprop="datePublished"]')).toHaveAttribute(
      "datetime",
      "2026-01-01T00:00:00.000Z",
    );
    expect(article.querySelector('[itemprop="dateModified"]')).toHaveAttribute(
      "datetime",
      "2026-02-01T00:00:00.000Z",
    );
    expect(screen.getByRole("heading", { level: 4, name: "Crisp" })).toBeVisible();
    expect(screen.getByText("bright").tagName).toBe("STRONG");
    expect(container.querySelector("style,script,a[href^='javascript:']")).toBeNull();
  });

  it("keeps Report discoverable for anonymous visitors", () => {
    render(<ReviewCard review={review} />);
    expect(screen.getByRole("button", { name: "Report" })).toBeVisible();
  });

  it("does not let authors report their own review", () => {
    render(<ReviewCard review={review} viewerId="fan-1" />);
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
  });
});

describe("ModerationGrid", () => {
  it("ignores an older queue response after the reveal state changes", async () => {
    let finishStale: ((page: { items: never[] }) => void) | undefined;
    const staleRequest = new Promise<{ items: never[] }>((resolve) => {
      finishStale = resolve;
    });
    const loader = vi
      .fn()
      .mockReturnValueOnce(staleRequest)
      .mockResolvedValueOnce({
        items: [
          {
            id: "current",
            authorId: "fan-1",
            sodaOfferingId: "cola",
            latestVersion: 2,
            cycle: 1,
            queueVersion: 3,
            current: { markdown: "Current protected review" },
            history: { versions: [], reports: [], decisions: [] },
          },
        ],
      });
    const user = userEvent.setup();
    render(
      <ModerationGrid
        kind="security"
        title="Security/Safety"
        loader={loader}
        decider={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deliberately inspect content" }));
    expect(await screen.findByText("Current protected review")).toBeVisible();
    finishStale?.({ items: [] });
    await Promise.resolve();

    expect(screen.getByText("Current protected review")).toBeVisible();
  });
});

describe("PublicReviewList", () => {
  it("ignores an in-flight pagination result after the loader changes", async () => {
    let finishOldPage: ((page: { reviews: PublishedReviewRecord[] }) => void) | undefined;
    const oldPage = new Promise<{ reviews: PublishedReviewRecord[] }>((resolve) => {
      finishOldPage = resolve;
    });
    const first = { ...review, id: "old-first", markdown: "Old first", contentLength: 9 };
    const stale = { ...review, id: "old-stale", markdown: "Old stale", contentLength: 9 };
    const current = { ...review, id: "new-current", markdown: "New current", contentLength: 11 };
    const oldLoader = vi
      .fn()
      .mockResolvedValueOnce({
        reviews: [first],
        next: { publishedAt: first.publishedAt, id: first.id },
      })
      .mockReturnValueOnce(oldPage);
    const newLoader = vi.fn().mockResolvedValue({ reviews: [current] });
    const user = userEvent.setup();
    const view = render(<PublicReviewList label="Reviews" loader={oldLoader} />);

    expect(await screen.findByText("Old first")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    view.rerender(<PublicReviewList label="Reviews" loader={newLoader} />);
    expect(await screen.findByText("New current")).toBeVisible();

    finishOldPage?.({ reviews: [stale] });
    await Promise.resolve();
    expect(screen.queryByText("Old stale")).not.toBeInTheDocument();
    expect(screen.getByText("New current")).toBeVisible();
  });
});
