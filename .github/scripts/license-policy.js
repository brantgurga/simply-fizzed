// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// @ts-check

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

export const COPYRIGHT_LINE = "Copyright (C) 2026 Brant Langer Gurganus";
export const SPDX_LINE = "SPDX-License-Identifier: AGPL-3.0-only";
export const LICENSE_POINTER = "See LICENSE for copying terms.";
export const ASSIGNMENT_ATTESTATION =
  "- [x] I own or control this contribution and assign its copyright under `COPYRIGHT_ASSIGNMENT.md`.";

export const EXCLUSIONS = Object.freeze({
  ".v8r/schemas/": "vendored schemas retain their upstream license notices",
  ".agents/": "tool-managed skill mirrors are documentation, not project source",
  ".augment/": "tool-managed environment and skill files are not application source",
  "public/icons.svg": "third-party social icon artwork is kept separate from project artwork",
});

const lineCommentExtensions = new Set([".js", ".jsx", ".rules", ".ts", ".tsx"]);
const hashCommentExtensions = new Set([".yaml", ".yml"]);
const blockCommentExtensions = new Set([".css"]);
const xmlCommentExtensions = new Set([".html", ".svg"]);
const hashCommentFiles = new Set([
  ".editorconfig",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  ".prettierignore",
  ".yamllint.yml",
  ".v8rrc.yml",
  "functions/.env.demo-simply-fizzed",
]);

/** @param {string} path */
export function noticeStyle(path) {
  if (Object.keys(EXCLUSIONS).some((excluded) => path === excluded || path.startsWith(excluded))) {
    return undefined;
  }
  if (path.startsWith(".husky/")) return "hash";
  if (hashCommentFiles.has(path)) return "hash";
  const extension = extname(path);
  if (lineCommentExtensions.has(extension) || extension === ".jsonc") return "line";
  if (hashCommentExtensions.has(extension)) return "hash";
  if (blockCommentExtensions.has(extension)) return "block";
  if (xmlCommentExtensions.has(extension)) return "xml";
  return undefined;
}

/** @param {"block" | "hash" | "line" | "xml"} style */
export function noticeText(style) {
  if (style === "hash") {
    return `# ${COPYRIGHT_LINE}\n# ${SPDX_LINE}\n# ${LICENSE_POINTER}`;
  }
  if (style === "block") {
    return `/* ${COPYRIGHT_LINE}\n * ${SPDX_LINE}\n * ${LICENSE_POINTER}\n */`;
  }
  if (style === "xml") {
    return `<!-- ${COPYRIGHT_LINE}; ${SPDX_LINE}; ${LICENSE_POINTER} -->`;
  }
  return `// ${COPYRIGHT_LINE}\n// ${SPDX_LINE}\n// ${LICENSE_POINTER}`;
}

/** @param {string} path @param {string} content */
export function validateNotice(path, content) {
  const style = noticeStyle(path);
  if (style === undefined) return [];
  const header = content.split("\n").slice(0, 12).join("\n");
  return header.includes(noticeText(style)) ? [] : [`${path}: missing required license notice`];
}

/** @param {string} body */
export function hasAssignmentAttestation(body) {
  return body.split(/\r?\n/u).some((line) => line === ASSIGNMENT_ATTESTATION);
}

/** @param {string} login @param {string} type @param {string} owner */
export function assignmentRequired(login, type, owner) {
  if (login === owner) return false;
  if (type === "Bot" && login === "dependabot[bot]") return false;
  return true;
}

/**
 * @param {string} pullRequestAuthor
 * @param {Array<{ sha: string, author: { login: string } | null }>} commits
 * @param {string} owner
 */
export function validateCommitAuthors(pullRequestAuthor, commits, owner) {
  return commits.flatMap(({ sha, author }) => {
    if (author === null) {
      return [`${sha.slice(0, 7)}: commit author is not linked to a GitHub account`];
    }
    if (author.login === owner || author.login === pullRequestAuthor) return [];
    return [
      `${sha.slice(0, 7)}: external commit author @${author.login} must submit and attest in their own pull request`,
    ];
  });
}

/** @param {string[]} paths */
export function validateLocalFiles(paths) {
  return paths.flatMap((path) => {
    if (noticeStyle(path) === undefined) return [];
    try {
      return validateNotice(path, readFileSync(path, "utf8"));
    } catch (error) {
      return [`${path}: could not read file (${String(error)})`];
    }
  });
}

/**
 * Validates a pull request without checking out or executing its code.
 * @param {{ github: any, context: any, core: { setFailed: (message: string) => void } }} options
 */
export async function validatePullRequest({ github, context, core }) {
  const pullRequest = context.payload.pull_request;
  if (pullRequest === undefined) {
    core.setFailed("License policy requires a pull_request_target event.");
    return;
  }
  const request = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: pullRequest.number,
    per_page: 100,
  };
  const results = await Promise.all([
    github.paginate(github.rest.pulls.listFiles, request),
    github.paginate(github.rest.pulls.listCommits, request),
  ]);
  /** @type {Array<{ filename: string, status: string }>} */
  const files = results[0];
  /** @type {Array<{ sha: string, author: { login: string } | null }>} */
  const commits = results[1];
  const paths = files.filter((file) => file.status !== "removed").map((file) => file.filename);
  const errors = validateCommitAuthors(pullRequest.user.login, commits, context.repo.owner);
  errors.push(
    ...(
      await Promise.all(
        paths
          .filter((path) => noticeStyle(path) !== undefined)
          .map(async (path) => {
            const response = await github.rest.repos.getContent({
              owner: context.repo.owner,
              repo: context.repo.repo,
              path,
              ref: pullRequest.head.sha,
            });
            if (
              Array.isArray(response.data) ||
              response.data.type !== "file" ||
              !response.data.content
            ) {
              return [`${path}: GitHub did not return readable file content`];
            }
            return validateNotice(
              path,
              Buffer.from(response.data.content, "base64").toString("utf8"),
            );
          }),
      )
    ).flat(),
  );

  if (
    assignmentRequired(pullRequest.user.login, pullRequest.user.type, context.repo.owner) &&
    !hasAssignmentAttestation(pullRequest.body ?? "")
  ) {
    errors.push(
      `Pull request body must contain this exact checked attestation:\n${ASSIGNMENT_ATTESTATION}`,
    );
  }

  if (errors.length > 0) core.setFailed(errors.join("\n"));
}

function trackedAndUntrackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateLocalFiles(trackedAndUntrackedFiles());
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("All applicable files contain the required license notice.");
  }
}
