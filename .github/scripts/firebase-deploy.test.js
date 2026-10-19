// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/firebase-deploy.sh");
/** @type {string[]} */
const temporaryDirectories = [];

/** @param {"success" | "generic" | "bootstrap"} scenario */
function runDeployment(scenario) {
  const directory = mkdtempSync(join(tmpdir(), "firebase-deploy-test-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  const runnerDirectory = join(directory, "runner");
  mkdirSync(binDirectory);
  mkdirSync(runnerDirectory);
  const fakeNpx = join(binDirectory, "npx");
  writeFileSync(
    fakeNpx,
    `#!/usr/bin/env bash
count_file="$RUNNER_TEMP/count"
count=0
[[ ! -f "$count_file" ]] || count=$(<"$count_file")
count=$((count + 1))
printf '%s' "$count" > "$count_file"
printf '%s\\n' "$*" >> "$RUNNER_TEMP/args"
case "$SCENARIO:$count" in
  success:1) exit 0 ;;
  generic:1) echo 'unrelated failure' >&2; exit 42 ;;
  bootstrap:1) echo 'Error: Pass the --force option to deploy functions with a failure policy' >&2; exit 1 ;;
  bootstrap:2|bootstrap:3) exit 0 ;;
  *) exit 99 ;;
esac
`,
  );
  chmodSync(fakeNpx, 0o755);
  const result = spawnSync("bash", [script, "test-project"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env["PATH"]}`,
      RUNNER_TEMP: runnerDirectory,
      SCENARIO: scenario,
    },
  });
  const argumentsLog = readFileSync(join(runnerDirectory, "args"), "utf8").trim().split("\n");
  return { result, argumentsLog };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("Firebase deployment retry bootstrap", () => {
  it("requires an explicit target project", () => {
    const result = spawnSync("bash", [script], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PROJECT_ID");
  });

  it("stops after a successful normal deployment", () => {
    const { result, argumentsLog } = runDeployment("success");
    expect(result.status).toBe(0);
    expect(argumentsLog).toHaveLength(1);
    expect(argumentsLog[0]).toContain("--project test-project");
  });

  it("preserves unrelated deployment failures", () => {
    const { result, argumentsLog } = runDeployment("generic");
    expect(result.status).toBe(42);
    expect(argumentsLog).toHaveLength(1);
  });

  it("forces only allowlisted retry Functions before retrying the full deployment", () => {
    const { result, argumentsLog } = runDeployment("bootstrap");
    expect(result.status).toBe(0);
    expect(argumentsLog).toHaveLength(3);
    expect(argumentsLog[1]).toContain("--only functions:recordAccountCreation");
    expect(argumentsLog[1]).toContain("--force");
    expect(argumentsLog[0]).not.toContain("--force");
    expect(argumentsLog[2]).not.toContain("--force");
  });
});
