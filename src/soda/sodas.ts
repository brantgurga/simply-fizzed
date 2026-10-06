// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { collection, doc, type Firestore, getDoc, getDocs } from "firebase/firestore";
import { COLLECTIONS, type Soda, sodaDocumentSchema } from "../model/firestore";

export interface SodaDocument extends Soda {
  id: string;
}

/** Whether a document ID can participate in canonical availability IDs. */
export function isAvailabilityReferenceId(id: string): boolean {
  return !id.includes("$");
}

export type DocumentLoad<T> =
  | { status: "found"; value: T }
  | { status: "missing" }
  | { status: "malformed" };

/** Parse an untrusted catalog document without unsafe casts. */
export function parseSoda(id: string, value: unknown): SodaDocument | undefined {
  const parsed = sodaDocumentSchema.safeParse(value);
  return parsed.success ? { id, ...parsed.data } : undefined;
}

/** Format a soda update timestamp using the visitor's locale. */
export function formatSodaUpdatedAt(updatedAt: Date, locales?: Intl.LocalesArgument): string {
  return new Intl.DateTimeFormat(locales, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(updatedAt);
}

export async function loadSoda(db: Firestore, id: string): Promise<DocumentLoad<SodaDocument>> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.sodas, id));
  if (!snapshot.exists()) return { status: "missing" };
  const soda = parseSoda(snapshot.id, snapshot.data());
  return soda === undefined ? { status: "malformed" } : { status: "found", value: soda };
}

/** Load valid catalog entries; malformed entries are excluded from contribution choices. */
export async function loadSodaCatalog(db: Firestore): Promise<SodaDocument[]> {
  const snapshot = await getDocs(collection(db, COLLECTIONS.sodas));
  return snapshot.docs.flatMap((item) => {
    if (!isAvailabilityReferenceId(item.id)) return [];
    const soda = parseSoda(item.id, item.data());
    return soda === undefined ? [] : [soda];
  });
}

const COMBINING_MARKS = /\p{M}/gu;
const AMPERSANDS = /&/g;
const NON_ALPHANUMERIC_CHARACTERS = /[^\p{L}\p{N}]+/gu;
const REPEATED_WHITESPACE = /\s+/g;

/** Normalize user input while retaining every meaningful word. */
export function normalizeSodaSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(AMPERSANDS, " and ")
    .replace(NON_ALPHANUMERIC_CHARACTERS, " ")
    .trim()
    .replace(REPEATED_WHITESPACE, " ");
}

export function formatSodaCatalogLabel(soda: Soda): string {
  return `${soda.brand} ${soda.name} — ${soda.flavor}`;
}

function searchableNames(soda: SodaDocument): string[] {
  const aliases = soda.aliases ?? [];
  return [
    formatSodaCatalogLabel(soda),
    `${soda.brand} ${soda.name}`,
    `${soda.brand} ${soda.flavor}`,
    soda.name,
    soda.brand,
    soda.flavor,
    ...aliases,
    ...aliases.flatMap((alias) => [
      `${alias} ${soda.name}`,
      `${alias} ${soda.flavor}`,
      `${alias} ${soda.name} ${soda.flavor}`,
    ]),
  ].map(normalizeSodaSearch);
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + (leftIndex < left.length || rightIndex < right.length ? 1 : 0) <= 1;
}

function tokensContainQuery(tokens: readonly string[], queryTokens: readonly string[]): boolean {
  const used = new Set<number>();
  return queryTokens.every((queryToken) => {
    const index = tokens.findIndex(
      (token, tokenIndex) =>
        !used.has(tokenIndex) && (token === queryToken || token.startsWith(queryToken)),
    );
    if (index < 0) return false;
    used.add(index);
    return true;
  });
}

function matchScore(soda: SodaDocument, query: string): number | undefined {
  const names = searchableNames(soda);
  if (names.includes(query)) return 0;
  if (names.some((name) => name.startsWith(query))) return 1;

  const queryTokens = query.split(" ");
  if (names.some((name) => tokensContainQuery(name.split(" "), queryTokens))) {
    return 2;
  }
  if (names.some((name) => name.includes(query))) return 3;

  if (
    queryTokens.every((token) => token.length >= 4) &&
    names.some((name) => {
      const tokens = name.split(" ");
      return (
        tokens.length === queryTokens.length &&
        queryTokens.every((token, index) => editDistanceAtMostOne(token, tokens[index] ?? ""))
      );
    })
  ) {
    return 4;
  }
  return undefined;
}

/** Rank only explicit matches. Ties remain separate choices and are never auto-selected. */
export function rankSodas(sodas: readonly SodaDocument[], input: string): SodaDocument[] {
  const query = normalizeSodaSearch(input);
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  if (query.length === 0) {
    return sodas.toSorted((left, right) =>
      collator.compare(formatSodaCatalogLabel(left), formatSodaCatalogLabel(right)),
    );
  }

  return sodas
    .flatMap((soda) => {
      const score = matchScore(soda, query);
      return score === undefined ? [] : [{ soda, score }];
    })
    .toSorted(
      (left, right) =>
        left.score - right.score ||
        collator.compare(formatSodaCatalogLabel(left.soda), formatSodaCatalogLabel(right.soda)),
    )
    .map(({ soda }) => soda);
}
