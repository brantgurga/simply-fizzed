// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

/* oxlint-disable oxc/no-map-spread -- Sanitization returns immutable syntax trees. */
/* oxlint-disable react/no-unstable-nested-components -- Contextual headings require render-specific component mappings. */
/* oxlint-disable react/only-export-components -- Rendering and canonical parsing must share one grammar. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- A bounded heading level produces a valid intrinsic element name. */

import type { Heading, List, PhrasingContent, Root, RootContent, Text } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import { REVIEW_CONTENT_LIMIT, REVIEW_MARKDOWN_LIMIT } from "../model/firestore";

const MEANINGFUL_CHARACTER = /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u;

function sourceFor(source: string, node: RootContent | PhrasingContent): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : source.slice(start, end);
}

function literal(source: string, node: RootContent | PhrasingContent): Text {
  return { type: "text", value: sourceFor(source, node) };
}

function sanitizePhrasing(source: string, node: PhrasingContent): PhrasingContent {
  if (node.type === "text" || node.type === "break") return node;
  if (node.type === "strong" || node.type === "emphasis") {
    return { ...node, children: node.children.map((child) => sanitizePhrasing(source, child)) };
  }
  return literal(source, node);
}

function isSupportedHeading(source: string, node: Heading): boolean {
  return /^ {0,3}#{1,6}(?:\s+|$)/.test(sourceFor(source, node));
}

function isSupportedList(source: string, node: List): boolean {
  if (
    node.children.some(
      (item) => item.children.length !== 1 || item.children[0]?.type !== "paragraph",
    )
  ) {
    return false;
  }
  const itemPattern = node.ordered ? /^ {0,3}\d+\.\s+/ : /^ {0,3}[-+*]\s+/;
  return sourceFor(source, node)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .every((line) => itemPattern.test(line));
}

function sanitizeRoot(source: string): Root {
  const parsed = fromMarkdown(source);
  const children: RootContent[] = parsed.children.map((node) => {
    if (node.type === "paragraph") {
      return { ...node, children: node.children.map((child) => sanitizePhrasing(source, child)) };
    }
    if (node.type === "heading" && isSupportedHeading(source, node)) {
      return { ...node, children: node.children.map((child) => sanitizePhrasing(source, child)) };
    }
    if (node.type === "list" && isSupportedList(source, node)) {
      return {
        ...node,
        children: node.children.map((item) => ({
          ...item,
          children: item.children.map((paragraph) =>
            paragraph.type === "paragraph"
              ? {
                  ...paragraph,
                  children: paragraph.children.map((child) => sanitizePhrasing(source, child)),
                }
              : paragraph,
          ),
        })),
      };
    }
    return { type: "paragraph", children: [literal(source, node)] };
  });
  return { type: "root", children };
}

/** Canonicalize the supported Markdown subset and retain unsupported syntax as literal text. */
export function constrainReviewMarkdown(input: string): string {
  const normalized = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  return toMarkdown(sanitizeRoot(normalized), {
    bullet: "-",
    emphasis: "*",
    strong: "*",
  }).trimEnd();
}

function textContent(markdown: string): string {
  const values: string[] = [];
  const visit = (node: RootContent | PhrasingContent): void => {
    if (node.type === "text") values.push(node.value);
    else if ("children" in node) node.children.forEach(visit);
  };
  sanitizeRoot(markdown).children.forEach(visit);
  return values.join("\n").replace(/\*\*|__|[*_]/g, "");
}

/** Count substantive characters without charging for supported formatting markup. */
export function reviewContentLength(markdown: string): number {
  return Array.from(textContent(markdown)).length;
}

/** Normalize empty formatting to no review and validate both review limits. */
export function prepareReviewMarkdown(
  input: string,
): { markdown: null; contentLength: 0 } | { markdown: string; contentLength: number } {
  const markdown = constrainReviewMarkdown(input).trim();
  const plain = textContent(markdown).trim();
  if (!MEANINGFUL_CHARACTER.test(plain)) return { markdown: null, contentLength: 0 };
  const contentLength = Array.from(plain).length;
  if (contentLength > REVIEW_CONTENT_LIMIT) throw new Error("Review content is too long.");
  if (markdown.length > REVIEW_MARKDOWN_LIMIT) throw new Error("Formatted review is too long.");
  return { markdown, contentLength };
}

function headingComponent(
  sourceDepth: number,
  headingBaseLevel: number,
  highestHeadingLevel: number,
): NonNullable<Components["h1"]> {
  return function ReviewHeading({ children }) {
    const level = Math.max(1, headingBaseLevel + sourceDepth - highestHeadingLevel);
    const component = level <= 6 ? (`h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6") : "div";
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
  const headingLevels = sanitizeRoot(canonical).children.flatMap((node) =>
    node.type === "heading" ? [node.depth] : [],
  );
  const highestHeadingLevel = headingLevels.length === 0 ? 1 : Math.min(...headingLevels);
  const components: Components = {
    p: ({ children }) => (
      <Typography component="p" variant="body1" sx={{ my: 1, overflowWrap: "anywhere" }}>
        {children}
      </Typography>
    ),
    h1: headingComponent(1, headingBaseLevel, highestHeadingLevel),
    h2: headingComponent(2, headingBaseLevel, highestHeadingLevel),
    h3: headingComponent(3, headingBaseLevel, highestHeadingLevel),
    h4: headingComponent(4, headingBaseLevel, highestHeadingLevel),
    h5: headingComponent(5, headingBaseLevel, highestHeadingLevel),
    h6: headingComponent(6, headingBaseLevel, highestHeadingLevel),
    ol: ({ children }) => (
      <Box component="ol" sx={{ my: 1, pl: 3, overflowWrap: "anywhere" }}>
        {children}
      </Box>
    ),
    ul: ({ children }) => (
      <Box component="ul" sx={{ my: 1, pl: 3, overflowWrap: "anywhere" }}>
        {children}
      </Box>
    ),
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
