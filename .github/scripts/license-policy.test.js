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

  it("validates pull request files through the API without a contribution checkout", async () => {
    const getContent = vi.fn().mockResolvedValue({
      data: {
        type: "file",
        content: Buffer.from(`${noticeText("line")}\nexport {};`).toString("base64"),
      },
    });
    const setFailed = vi.fn();
    await validatePullRequest({
      github: {
        paginate: vi.fn().mockResolvedValue([
          { filename: "src/new.ts", status: "added" },
          { filename: "README.md", status: "modified" },
        ]),
        rest: { pulls: { listFiles: vi.fn() }, repos: { getContent } },
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
