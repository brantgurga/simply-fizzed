// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

/* oxlint-disable react/no-array-index-key -- Line fragments have no stable identity beyond order. */
/* oxlint-disable react/only-export-components -- Rendering and canonical parsing must share one grammar. */
/* oxlint-disable typescript/no-unsafe-type-assertion -- The bounded heading level creates a valid intrinsic element name. */

import { Fragment, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { REVIEW_CONTENT_LIMIT, REVIEW_MARKDOWN_LIMIT } from "../model/firestore";

const MEANINGFUL_CHARACTER = /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u;
const UNSUPPORTED_DELIMITERS = new Set(["`", "|", "[", "]", "~"]);

function escapeUnsupportedDelimiters(input: string): string {
  let escaped = "";
  let precedingBackslashes = 0;
  for (const character of input) {
    if (character === "\\") {
      escaped += character;
      precedingBackslashes += 1;
      continue;
    }
    if (UNSUPPORTED_DELIMITERS.has(character) && precedingBackslashes % 2 === 0) {
      escaped += "\\";
    }
    escaped += character;
    precedingBackslashes = 0;
  }
  return escaped;
}

/** Neutralize unsupported Markdown constructs while retaining readable literal text. */
export function constrainReviewMarkdown(input: string): string {
  const normalized = input
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/&(?!(?:amp|lt|gt);)/g, "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escapeUnsupportedDelimiters(normalized)
    .replace(/^(\s{0,3})(?=(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,}|=+)\s*$)/gm, "$1\\")
    .replace(/^(\s*\d+)(?=\)\s+)/gm, "$1\\")
    .replace(/^( {4,}|\t)/gm, "\\$&");
}

function literalText(markdown: string): string {
  return markdown
    .replace(/^\s{0,3}#{1,6}(?:\s+|$)/gm, "")
    .replace(/^\s*(?:[-+*]|\d+\.)(?:\s+|$)/gm, "")
    .replace(/\*\*|__|[*_]/g, "")
    .replace(/\\([\\`|[\]>*_#.!+~)=-])/g, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Count substantive characters without charging for supported formatting markup. */
export function reviewContentLength(markdown: string): number {
  return Array.from(literalText(markdown)).length;
}

/** Normalize empty formatting to no review and validate both review limits. */
export function prepareReviewMarkdown(
  input: string,
): { markdown: null; contentLength: 0 } | { markdown: string; contentLength: number } {
  const markdown = constrainReviewMarkdown(input).trim();
  const plain = literalText(markdown).trim();
  if (!MEANINGFUL_CHARACTER.test(plain)) return { markdown: null, contentLength: 0 };
  const contentLength = Array.from(plain).length;
  if (contentLength > REVIEW_CONTENT_LIMIT) throw new Error("Review content is too long.");
  if (markdown.length > REVIEW_MARKDOWN_LIMIT) throw new Error("Formatted review is too long.");
  return { markdown, contentLength };
}

function decodeLiteral(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function inline(markdown: string, keyPrefix = "inline"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let text = "";
  let index = 0;
  const flush = () => {
    if (text.length > 0) nodes.push(decodeLiteral(text));
    text = "";
  };

  while (index < markdown.length) {
    if (markdown[index] === "\\" && index + 1 < markdown.length) {
      text += markdown[index + 1];
      index += 2;
      continue;
    }
    const strong = markdown.startsWith("**", index)
      ? "**"
      : markdown.startsWith("__", index)
        ? "__"
        : undefined;
    if (strong !== undefined) {
      const end = markdown.indexOf(strong, index + 2);
      if (end > index + 2) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-strong-${index}`}>
            {inline(markdown.slice(index + 2, end), `${keyPrefix}-${index}`)}
          </strong>,
        );
        index = end + 2;
        continue;
      }
    }
    const marker = markdown[index];
    if ((marker === "*" || marker === "_") && markdown[index + 1] !== marker) {
      const end = markdown.indexOf(marker, index + 1);
      if (end > index + 1) {
        flush();
        nodes.push(
          <em key={`${keyPrefix}-em-${index}`}>
            {inline(markdown.slice(index + 1, end), `${keyPrefix}-${index}`)}
          </em>,
        );
        index = end + 1;
        continue;
      }
    }
    text += marker;
    index += 1;
  }
  flush();
  return nodes;
}

function paragraph(lines: string[], key: string): ReactNode {
  return (
    <Typography component="p" variant="body1" key={key} sx={{ my: 1, overflowWrap: "anywhere" }}>
      {lines.map((line, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 && <br />}
          {inline(line, `${key}-${index}`)}
        </Fragment>
      ))}
    </Typography>
  );
}

/** Render only the explicitly supported Markdown subset with contextual headings. */
export function ConstrainedMarkdown({
  markdown,
  headingBaseLevel = 3,
}: {
  markdown: string;
  headingBaseLevel?: number;
}) {
  const lines = markdown.split("\n");
  const headingLevels = lines.flatMap((line) => {
    const heading = /^(#{1,6})\s+/.exec(line);
    return heading === null ? [] : [(heading[1] ?? "").length];
  });
  const highestHeadingLevel = headingLevels.length === 0 ? 1 : Math.min(...headingLevels);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      const level = Math.max(1, headingBaseLevel + (heading[1] ?? "").length - highestHeadingLevel);
      const component =
        level <= 6 ? (`h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6") : "div";
      blocks.push(
        <Typography
          key={`heading-${index}`}
          component={component}
          variant={level <= 4 ? "subtitle1" : "subtitle2"}
          sx={{ mt: 1.5, mb: 0.5, fontWeight: 600 }}
          {...(level <= 6 ? {} : { role: "heading", "aria-level": level })}
        >
          {inline(heading[2] ?? "", `heading-${index}`)}
        </Typography>,
      );
      index += 1;
      continue;
    }
    const list = /^\s*(?:(\d+)\.|([-+*]))\s+(.+)$/.exec(line);
    if (list !== null) {
      const ordered = list[1] !== undefined;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^\s*(?:(\d+)\.|([-+*]))\s+(.+)$/.exec(lines[index] ?? "");
        if (item === null || (item[1] !== undefined) !== ordered) break;
        items.push(<li key={`item-${index}`}>{inline(item[3] ?? "", `item-${index}`)}</li>);
        index += 1;
      }
      blocks.push(
        <Box
          key={`list-${index}`}
          component={ordered ? "ol" : "ul"}
          sx={{ my: 1, pl: 3, overflowWrap: "anywhere" }}
        >
          {items}
        </Box>,
      );
      continue;
    }
    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim().length > 0) {
      if (
        /^(#{1,6})\s+/.test(lines[index] ?? "") ||
        /^\s*(?:\d+\.|[-+*])\s+/.test(lines[index] ?? "")
      ) {
        break;
      }
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(paragraph(paragraphLines, `paragraph-${index}`));
  }

  return (
    <Box
      className="review-content"
      sx={{ "& > :first-child": { mt: 0 }, "& > :last-child": { mb: 0 } }}
    >
      {blocks}
    </Box>
  );
}
