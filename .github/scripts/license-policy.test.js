// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { describe, expect, it, vi } from "vitest";
import {
  ASSIGNMENT_ATTESTATION,
  assignmentRequired,
  hasAssignmentAttestation,
  noticeStyle,
  noticeText,
  validateCommitAuthors,
  validateNotice,
  validatePullRequest,
} from "./license-policy.js";

describe("license policy", () => {
  it("maps authored file types to their comment syntax", () => {
    expect(noticeStyle("src/App.tsx")).toBe("line");
    expect(noticeStyle("firestore.rules")).toBe("line");
    expect(noticeStyle("index.html")).toBe("xml");
    expect(noticeStyle(".github/workflows/ci.yml")).toBe("hash");
    expect(noticeStyle("public/favicon.svg")).toBe("xml");
  });

  it("excludes non-commentable, vendored, and documented third-party files", () => {
    expect(noticeStyle("package.json")).toBeUndefined();
    expect(noticeStyle("package-lock.json")).toBeUndefined();
    expect(noticeStyle(".v8r/schemas/package.json")).toBeUndefined();
    expect(noticeStyle("public/icons.svg")).toBeUndefined();
  });

  it("reports each missing notice component", () => {
    expect(validateNotice("src/new.ts", "export {};")).toHaveLength(1);
    expect(validateNotice("src/new.ts", `${noticeText("line")}\nexport {};`)).toEqual([]);
  });

  it("requires an exact checked assignment attestation", () => {
    expect(hasAssignmentAttestation(ASSIGNMENT_ATTESTATION)).toBe(true);
    expect(hasAssignmentAttestation(ASSIGNMENT_ATTESTATION.replace("[x]", "[ ]"))).toBe(false);
    expect(hasAssignmentAttestation(`${ASSIGNMENT_ATTESTATION} extra`)).toBe(false);
  });

  it("exempts only the owner and mechanical Dependabot updates", () => {
    expect(assignmentRequired("brantgurga", "User", ["src/App.tsx"], "brantgurga")).toBe(false);
    expect(
      assignmentRequired(
        "dependabot[bot]",
        "Bot",
        ["package.json", "package-lock.json"],
        "brantgurga",
      ),
    ).toBe(false);
    expect(assignmentRequired("dependabot[bot]", "Bot", ["src/App.tsx"], "brantgurga")).toBe(true);
    expect(assignmentRequired("contributor", "User", ["README.md"], "brantgurga")).toBe(true);
  });

  it("rejects commits whose external author cannot personally attest", () => {
    expect(
      validateCommitAuthors(
        "brantgurga",
        [{ sha: "1234567890", author: { login: "contributor" } }],
        "brantgurga",
      ),
    ).toHaveLength(1);
    expect(
      validateCommitAuthors(
        "contributor",
        [
          { sha: "1234567890", author: { login: "contributor" } },
          { sha: "abcdef0123", author: { login: "another-contributor" } },
        ],
        "brantgurga",
      ),
    ).toHaveLength(1);
    expect(
      validateCommitAuthors("contributor", [{ sha: "1234567890", author: null }], "brantgurga"),
    ).toHaveLength(1);
  });

  it("allows commits authored by the attesting contributor or repository owner", () => {
    expect(
      validateCommitAuthors(
        "contributor",
        [
          { sha: "1234567890", author: { login: "contributor" } },
          { sha: "abcdef0123", author: { login: "brantgurga" } },
        ],
        "brantgurga",
      ),
    ).toEqual([]);
  });

  it("validates pull request files through the API without a contribution checkout", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        content: Buffer.from(`${noticeText("line")}\nexport {};`).toString("base64"),
      },
    });
    const setFailed = vi.fn();
    const listFiles = vi.fn();
    const listCommits = vi.fn();
    const paginate = vi.fn((method) => {
      if (method === listFiles) {
        return Promise.resolve([
          { filename: "src/new.ts", status: "added" },
          { filename: "README.md", status: "modified" },
        ]);
      }
      return Promise.resolve([{ sha: "abc1234", author: { login: "contributor" } }]);
    });
    await validatePullRequest({
      github: {
        paginate,
        rest: { pulls: { listFiles, listCommits }, repos: { getContent } },
      },
      context: {
        repo: { owner: "brantgurga", repo: "simply-fizzed" },
        payload: {
          pull_request: {
            number: 10,
            body: ASSIGNMENT_ATTESTATION,
            user: { login: "contributor", type: "User" },
            head: { sha: "abc123", repo: { name: "fork", owner: { login: "contributor" } } },
          },
        },
      },
      core: { setFailed },
    });

    expect(getContent).toHaveBeenCalledWith({
      owner: "brantgurga",
      repo: "simply-fizzed",
      path: "src/new.ts",
      ref: "abc123",
    });
    expect(setFailed).not.toHaveBeenCalled();
  });
});
