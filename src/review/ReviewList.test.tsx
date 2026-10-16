// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCard } from "./ReviewList";
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
