// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import { constrainReviewMarkdown, reviewHeadingDepths } from "./markdownFormat";

const HEADING_ELEMENTS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const ReviewParagraph: NonNullable<Components["p"]> = ({ children }) => (
  <Typography component="p" variant="body1" sx={{ my: 1, overflowWrap: "anywhere" }}>
    {children}
  </Typography>
);

const ReviewOrderedList: NonNullable<Components["ol"]> = ({ children }) => (
  <Box component="ol" sx={{ my: 1, pl: 3, overflowWrap: "anywhere" }}>
    {children}
  </Box>
);

const ReviewUnorderedList: NonNullable<Components["ul"]> = ({ children }) => (
  <Box component="ul" sx={{ my: 1, pl: 3, overflowWrap: "anywhere" }}>
    {children}
  </Box>
);

function headingComponent(
  sourceDepth: number,
  headingBaseLevel: number,
  highestHeadingLevel: number,
): NonNullable<Components["h1"]> {
  return function ReviewHeading({ children }) {
    const level = Math.max(1, headingBaseLevel + sourceDepth - highestHeadingLevel);
    const component = HEADING_ELEMENTS[level - 1] ?? "div";
    return (
      <Typography
        component={component}
        variant={level <= 4 ? "subtitle1" : "subtitle2"}
        sx={{ mt: 1.5, mb: 0.5, fontWeight: 600 }}
        {...(level <= 6 ? {} : { role: "heading", "aria-level": level })}
      >
        {children}
      </Typography>
    );
  };
}

/** Render only the dependency-parsed, explicitly supported Markdown subset. */
export function ConstrainedMarkdown({
  markdown,
  headingBaseLevel = 3,
}: {
  markdown: string;
  headingBaseLevel?: number;
}) {
  const canonical = constrainReviewMarkdown(markdown);
  const headingLevels = reviewHeadingDepths(canonical);
  const highestHeadingLevel = headingLevels.length === 0 ? 1 : Math.min(...headingLevels);
  const components: Components = {
    p: ReviewParagraph,
    h1: headingComponent(1, headingBaseLevel, highestHeadingLevel),
    h2: headingComponent(2, headingBaseLevel, highestHeadingLevel),
    h3: headingComponent(3, headingBaseLevel, highestHeadingLevel),
    h4: headingComponent(4, headingBaseLevel, highestHeadingLevel),
    h5: headingComponent(5, headingBaseLevel, highestHeadingLevel),
    h6: headingComponent(6, headingBaseLevel, highestHeadingLevel),
    ol: ReviewOrderedList,
    ul: ReviewUnorderedList,
  };

  return (
    <Box
      className="review-content"
      sx={{ "& > :first-child": { mt: 0 }, "& > :last-child": { mb: 0 } }}
    >
      <ReactMarkdown
        allowedElements={[
          "p",
          "br",
          "strong",
          "em",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "ol",
          "ul",
          "li",
        ]}
        components={components}
        remarkPlugins={[remarkBreaks]}
        skipHtml
        unwrapDisallowed
      >
        {canonical}
      </ReactMarkdown>
    </Box>
  );
}
