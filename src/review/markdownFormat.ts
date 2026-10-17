// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import type { Heading, List, PhrasingContent, Root, RootContent, Text } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toMarkdown } from "mdast-util-to-markdown";
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
    node.children = node.children.map((child) => sanitizePhrasing(source, child));
    return node;
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
  parsed.children = parsed.children.map((node) => {
    if (node.type === "paragraph") {
      node.children = node.children.map((child) => sanitizePhrasing(source, child));
      return node;
    }
    if (node.type === "heading" && isSupportedHeading(source, node)) {
      node.children = node.children.map((child) => sanitizePhrasing(source, child));
      return node;
    }
    if (node.type === "list" && isSupportedList(source, node)) {
      for (const item of node.children) {
        for (const paragraph of item.children) {
          if (paragraph.type === "paragraph") {
            paragraph.children = paragraph.children.map((child) => sanitizePhrasing(source, child));
          }
        }
      }
      return node;
    }
    return { type: "paragraph", children: [literal(source, node)] };
  });
  return parsed;
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

/** Return supported source heading levels for contextual rendering. */
export function reviewHeadingDepths(markdown: string): number[] {
  return sanitizeRoot(markdown).children.flatMap((node) =>
    node.type === "heading" ? [node.depth] : [],
  );
}
