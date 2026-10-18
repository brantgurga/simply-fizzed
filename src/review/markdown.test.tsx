// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConstrainedMarkdown } from "./markdown";
import { constrainReviewMarkdown, prepareReviewMarkdown } from "./markdownFormat";

const persistedExample = `# First impressions

Bright and **citrusy** with *gentle* sweetness.
Second line.

- Lime
- Orange with **bold and *nested* emphasis**

1. Chill
2. Pour`;

describe("constrained review Markdown", () => {
  it("renders every supported construct with contextual heading semantics", () => {
    render(<ConstrainedMarkdown markdown={persistedExample} headingBaseLevel={4} />);

    expect(screen.getByRole("heading", { level: 4, name: "First impressions" })).toBeVisible();
    expect(screen.getByText("citrusy").tagName).toBe("STRONG");
    expect(screen.getByText("gentle").tagName).toBe("EM");
    expect(screen.getByText("nested").tagName).toBe("EM");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    const paragraph = screen.getByText("citrusy").closest("p");
    expect(paragraph).toHaveTextContent("Second line.");
    expect(paragraph?.querySelector("br")).not.toBeNull();
  });

  it("normalizes relative heading hierarchy to its rendering context", () => {
    render(
      <ConstrainedMarkdown
        markdown={"### Highest\n#### Child\n###### Deep"}
        headingBaseLevel={5}
      />,
    );

    expect(screen.getByRole("heading", { level: 5, name: "Highest" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 6, name: "Child" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 8, name: "Deep" })).toBeVisible();
  });

  it("normalizes structurally empty formatting to no review", () => {
    expect(prepareReviewMarkdown("**__**\n# ")).toEqual({ markdown: null, contentLength: 0 });
  });

  it("preserves canonical unsupported-looking text across subsequent edits", () => {
    const canonical = constrainReviewMarkdown(
      "[site](https://example.test) <b>literal</b> `code` a | b",
    );

    expect(constrainReviewMarkdown(canonical)).toBe(canonical);
  });

  it.each([
    ["link", "[site](https://example.test)"],
    ["image", "![alt](https://example.test/image.png)"],
    ["HTML", "<img src=x onerror=alert(1)>"],
    ["code", "`alert(1)`"],
    ["blockquote", "> quoted"],
    ["thematic break", "* * *"],
    ["alternate ordered list", "1) item"],
    ["strikethrough", "~~removed~~"],
    ["table", "a | b"],
  ])("keeps pasted or direct %s syntax literal", (_name, input) => {
    const constrained = constrainReviewMarkdown(input);
    const { container } = render(<ConstrainedMarkdown markdown={constrained} />);

    expect(container.querySelector("a,img,code,blockquote,table")).toBeNull();
    expect(within(container).getByText(/./)).toBeVisible();
  });
});
