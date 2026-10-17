// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { expect } from "expect";
import { ServiceError } from "./management.js";
import {
  moderationDecisionMatches,
  moderationQueueKind,
  requireCurrentModerator,
  resolveCurrentActor,
  reviewKey,
  reviewVersionKey,
  revisionDisposition,
  validateReviewMarkdown,
} from "./reviews.js";

describe("review authoritative validation", () => {
  it("accepts supported formatting without charging markup", () => {
    expect(validateReviewMarkdown("# Taste\n\nGreat **cola**.", 18)).toBe(
      "# Taste\n\nGreat **cola**.",
    );
  });

  it("accepts the canonical escaped representation of unsupported-looking text", () => {
    expect(validateReviewMarkdown("Literal \\[site\\](url) and &lt;b&gt;text&lt;/b&gt;", 35)).toBe(
      "Literal \\[site\\](url) and &lt;b&gt;text&lt;/b&gt;",
    );
  });

  for (const [name, markdown, length] of [
    ["raw HTML", "<img src=x>", 11],
    ["unescaped link syntax", "[site](url)", 11],
    ["delimiter after an even backslash run", "\\\\[site\\](url)", 0],
    ["inline code", "`code`", 6],
    ["thematic break", "* * *", 5],
    ["alternate ordered list", "1) item", 7],
    ["strikethrough", "~~removed~~", 11],
    ["oversized stored content", "x".repeat(3_001), 3_001],
    ["oversized logical content", "x".repeat(2_001), 2_001],
    ["forged logical count", "Great cola", 1],
  ] as const) {
    it(`rejects ${name}`, () => {
      expect(() => validateReviewMarkdown(markdown, length)).toThrow(ServiceError);
    });
  }

  it("keeps revisions pending when based on hidden, reported, or older-cycle state", () => {
    expect(revisionDisposition("visible", 0, 0)).toBe("visible");
    expect(revisionDisposition("pending", 1, 1)).toBe("pending");
    expect(revisionDisposition("hidden", 1, 1)).toBe("pending");
    expect(revisionDisposition("visible", 2, 1)).toBe("pending");
    expect(revisionDisposition("visible", 1, 1, 1, null)).toBe("pending");
    expect(revisionDisposition("visible", 1, 1, 1, null, null)).toBe("visible");
    expect(revisionDisposition("visible", 1, 1, 2, 1, 1)).toBe("visible");
  });

  it("makes Security/Safety dominant throughout one moderation cycle", () => {
    expect(moderationQueueKind("offensive", false, false)).toBe("reported");
    expect(moderationQueueKind("security-safety", false, false)).toBe("security");
    expect(moderationQueueKind("offensive", true, false)).toBe("security");
    expect(moderationQueueKind(undefined, false, true)).toBe("revised");
    expect(moderationQueueKind(undefined, true, true)).toBe("security");
  });

  it("uses stable collision-resistant identities without exposing path separators", () => {
    expect(reviewKey("fan/a", "soda/b")).toMatch(/^[a-f0-9]{64}$/);
    expect(reviewKey("fan/a", "soda/b")).toBe(reviewKey("fan/a", "soda/b"));
    expect(reviewKey("fan", "a/soda/b")).not.toBe(reviewKey("fan/a", "soda/b"));
    expect(reviewVersionKey("fan/a", "soda/b", 1)).toMatch(/^[a-f0-9]{64}$/);
    expect(reviewVersionKey("fan/a", "soda/b", 1)).not.toBe(reviewVersionKey("fan/a", "soda/b", 2));
  });

  it("rejects a decision after the queue changes within the same cycle and version", () => {
    const input = {
      authorId: "author",
      sodaOfferingId: "soda",
      expectedVersion: 3,
      expectedCycle: 2,
      expectedQueueVersion: 4,
      decision: "allow" as const,
    };
    const state = {
      authorId: "author",
      sodaOfferingId: "soda",
      version: 3,
      cycle: 2,
      status: "pending",
      queue: {
        authorId: "author",
        sodaOfferingId: "soda",
        latestVersion: 3,
        cycle: 2,
        queueVersion: 4,
      },
    };
    expect(moderationDecisionMatches(state, input)).toBe(true);
    expect(
      moderationDecisionMatches({ ...state, queue: { ...state.queue, queueVersion: 5 } }, input),
    ).toBe(false);
    expect(moderationDecisionMatches({ ...state, cycle: 3 }, input)).toBe(false);
    expect(moderationDecisionMatches({ ...state, version: 4 }, input)).toBe(false);
  });

  it("permits proactive hide only when no moderation queue exists", () => {
    const input = {
      authorId: "author",
      sodaOfferingId: "soda",
      expectedVersion: 1,
      expectedCycle: 0,
      expectedQueueVersion: null,
      decision: "hide" as const,
    };
    const state = {
      authorId: "author",
      sodaOfferingId: "soda",
      version: 1,
      cycle: 0,
      status: "visible",
      queue: undefined,
    };
    expect(moderationDecisionMatches(state, input)).toBe(true);
    expect(
      moderationDecisionMatches(
        {
          ...state,
          queue: {
            authorId: "author",
            sodaOfferingId: "soda",
            latestVersion: 1,
            cycle: 0,
            queueVersion: 1,
          },
        },
        input,
      ),
    ).toBe(false);
  });
});

describe("review callable authority", () => {
  it("uses current Auth state so a revoked moderator is denied", async () => {
    const auth = {
      getUser: async (uid: string) => ({ uid, disabled: false, customClaims: {} }),
    };
    await expect(requireCurrentModerator(auth, "former-moderator")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("denies disabled reporters from current Auth state", async () => {
    const auth = {
      getUser: async (uid: string) => ({ uid, disabled: true, customClaims: { moderator: true } }),
    };
    await expect(resolveCurrentActor(auth, "disabled-user")).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});
