// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(path, "utf8");
const workflow = read(".github/workflows/firebase-hosting.yml");
const moduleMain = read("infra/modules/firebase/main.tf");
const productionImports = read("infra/environments/production/imports.tf");
const bootstrapScript = resolve("scripts/bootstrap-firebase-project.sh");

const runtimeAccounts = {
  GET_MY_AUTHORIZATION_SERVICE_ACCOUNT: "get-my-authorization",
  SEARCH_USERS_SERVICE_ACCOUNT: "search-users",
  REVEAL_USER_EMAIL_SERVICE_ACCOUNT: "reveal-user-email",
  SAVE_MY_PROFILE_SERVICE_ACCOUNT: "save-my-profile",
  APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT: "apply-user-management",
  GET_USER_AUDIT_HISTORY_SERVICE_ACCOUNT: "get-user-audit-history",
  RECORD_ACCOUNT_CREATION_SERVICE_ACCOUNT: "record-account-creation",
  REPORT_REVIEW_SERVICE_ACCOUNT: "report-review",
  MODERATE_REVIEW_SERVICE_ACCOUNT: "moderate-review",
  LOAD_REVIEW_MODERATION_QUEUE_SERVICE_ACCOUNT: "load-review-moderation-queue",
  PROCESS_REVIEW_REVISION_SERVICE_ACCOUNT: "process-review-revision",
  PROCESS_REVIEW_RATING_SERVICE_ACCOUNT: "process-review-rating",
};
const runtimeParameters = Object.keys(runtimeAccounts);

describe("Terraform infrastructure contracts", () => {
  it("pins Terraform and Google provider versions", () => {
    const versions = read("infra/environments/production/versions.tf");
    expect(versions).toContain('required_version = "= 1.16.6"');
    expect(versions).toContain('version = "~> 8.7.0"');
  });

  it("uses only additive, non-basic IAM grants", () => {
    expect(moduleMain).toContain("google_project_iam_member");
    expect(moduleMain).toContain("google_service_account_iam_member");
    expect(moduleMain).not.toMatch(/resource\s+"google_[^"]+_iam_(?:binding|policy)"/u);
    expect(moduleMain).not.toMatch(/roles\/(?:owner|editor|viewer)"/u);
    expect(moduleMain.match(/roles\/firebaseauth\.editor/gu)).toHaveLength(1);
    expect(moduleMain.match(/roles\/eventarc\.eventReceiver/gu)).toHaveLength(3);
    expect(moduleMain.match(/roles\/run\.invoker/gu)).toHaveLength(3);
    expect(moduleMain.match(/\n      account_id\s+=/gu)).toHaveLength(12);
    expect(moduleMain).not.toContain('"roles/resourcemanager.projectIamAdmin",');
    expect(moduleMain).toContain("firebase-functions-default-service-account");
  });

  it("keeps each parameter paired with its exact runtime identity", () => {
    for (const [parameter, accountId] of Object.entries(runtimeAccounts)) {
      const accountBlock = new RegExp(
        `${parameter}\\s*=\\s*\\{[^}]*account_id\\s*=\\s*"${accountId}"`,
        "u",
      );
      expect(moduleMain).toMatch(accountBlock);
      expect(productionImports).toMatch(new RegExp(`${parameter}\\s*=\\s*"${accountId}"`, "u"));
    }
    expect(productionImports).toContain("var.import_existing_runtime_service_accounts ?");
    expect(moduleMain).not.toContain("import {");
  });
});

describe("Terraform Firebase delivery contracts", () => {
  it("authenticates before planning and applies exactly the saved plan", () => {
    const steps = [
      "Authenticate to Google Cloud",
      "Set up Terraform",
      "Terraform init",
      "Terraform plan",
      "Terraform apply",
      "Read Terraform deployment outputs",
      "Deploy Functions, Firestore rules, and indexes",
    ];
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1];
      const current = steps[index];
      if (previous === undefined || current === undefined) throw new Error("Invalid step order");
      expect(workflow.indexOf(previous)).toBeLessThan(workflow.indexOf(current));
    }
    expect(workflow).toMatch(/terraform plan [^\n]*-out="\$RUNNER_TEMP\/production\.tfplan"/u);
    expect(workflow).toContain('terraform apply "$RUNNER_TEMP/production.tfplan"');
  });

  it("maps all runtime identities from Terraform rather than GitHub variables", () => {
    expect(workflow).toContain("terraform output -json function_service_accounts");
    for (const parameter of runtimeParameters) {
      expect(workflow).toContain(parameter);
      expect(workflow).not.toContain(`FIREBASE_${parameter}`);
    }
  });

  it("ships Terraform with the tested deployment artifact", () => {
    expect(workflow).toMatch(/path:\s*\|[\s\S]*infra\//u);
  });
});

const createMockCloudTools = () => {
  const root = mkdtempSync(join(tmpdir(), "firebase-bootstrap-"));
  const bin = join(root, "bin");
  const state = join(root, "state");
  const log = join(root, "commands.log");
  mkdirSync(bin);
  mkdirSync(state);
  const mock = `#!/usr/bin/env bash
set -euo pipefail
tool=$(basename "$0")
echo "$tool $*" >>"$MOCK_LOG"
if [[ -n "\${MOCK_FAIL:-}" && "$tool $*" == *"$MOCK_FAIL"* ]]; then exit 42; fi
if [[ "$tool" == jq ]]; then [[ -f "$MOCK_STATE/firebase" ]]; exit; fi
if [[ "$tool" == firebase ]]; then
  if [[ "$1" == projects:list ]]; then echo '{}'; else touch "$MOCK_STATE/firebase"; fi
  exit
fi
args="$*"
case "$args" in
  *"--format=value(projectNumber)"*) echo 123456789; exit ;;
  *"--format=value(name)"*) echo projects/123456789/locations/global/workloadIdentityPools/github/providers/simply-fizzed; exit ;;
  "projects describe "*) [[ -f "$MOCK_STATE/project" ]]; exit ;;
  "projects create "*) touch "$MOCK_STATE/project" ;;
  "firestore databases describe "*) [[ -f "$MOCK_STATE/firestore" ]]; exit ;;
  "firestore databases create "*) touch "$MOCK_STATE/firestore" ;;
  "storage buckets describe "*) [[ -f "$MOCK_STATE/bucket" ]]; exit ;;
  "storage buckets create "*) touch "$MOCK_STATE/bucket" ;;
  "iam workload-identity-pools providers describe "*) [[ -f "$MOCK_STATE/provider" ]]; exit ;;
  "iam workload-identity-pools providers create-oidc "*) touch "$MOCK_STATE/provider" ;;
  "iam workload-identity-pools describe "*) [[ -f "$MOCK_STATE/pool" ]]; exit ;;
  "iam workload-identity-pools create "*) touch "$MOCK_STATE/pool" ;;
  "iam service-accounts describe "*) [[ -f "$MOCK_STATE/deployer" ]]; exit ;;
  "iam service-accounts create "*) touch "$MOCK_STATE/deployer" ;;
esac
`;
  for (const tool of ["firebase", "gcloud", "jq"]) {
    const path = join(bin, tool);
    writeFileSync(path, mock);
    chmodSync(path, 0o755);
  }
  return {
    root,
    log,
    env: {
      ...process.env,
      MOCK_LOG: log,
      MOCK_STATE: state,
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    },
  };
};

describe("administrator bootstrap contracts", () => {
  const bootstrap = read("scripts/bootstrap-firebase-project.sh");

  it("rejects invalid project IDs before invoking cloud tools", () => {
    const result = spawnSync("bash", [bootstrapScript, "INVALID_PROJECT"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("PROJECT_ID");
  });

  it("creates prerequisites once and safely reconciles a repeated run", () => {
    const mock = createMockCloudTools();
    try {
      const first = spawnSync("bash", [bootstrapScript, "valid-project"], {
        encoding: "utf8",
        env: mock.env,
      });
      const second = spawnSync("bash", [bootstrapScript, "valid-project"], {
        encoding: "utf8",
        env: mock.env,
      });
      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);
      const commands = readFileSync(mock.log, "utf8");
      for (const creation of [
        "gcloud projects create",
        "gcloud firestore databases create",
        "gcloud storage buckets create",
        "gcloud iam workload-identity-pools create",
        "gcloud iam workload-identity-pools providers create-oidc",
        "gcloud iam service-accounts create",
        "firebase projects:addfirebase",
      ]) {
        expect(commands.split(creation)).toHaveLength(2);
      }
      expect(commands).toContain("providers update-oidc");
    } finally {
      rmSync(mock.root, { recursive: true, force: true });
    }
  });

  it("stops immediately when a cloud command fails", () => {
    const mock = createMockCloudTools();
    try {
      const result = spawnSync("bash", [bootstrapScript, "valid-project"], {
        encoding: "utf8",
        env: { ...mock.env, MOCK_FAIL: "gcloud services enable" },
      });
      expect(result.status).toBe(42);
      expect(readFileSync(mock.log, "utf8")).not.toContain("firebase projects:list");
    } finally {
      rmSync(mock.root, { recursive: true, force: true });
    }
  });

  it("hardens remote state, IAM policy changes, and repository federation", () => {
    expect(bootstrap).toContain("--versioning");
    expect(bootstrap).toContain("--public-access-prevention");
    expect(bootstrap).toContain("--uniform-bucket-level-access");
    expect(bootstrap).toContain("modifiedGrantsByRole");
    expect(bootstrap).toContain("terraform-managed-roles");
    expect(bootstrap).toContain('repository_id == "1320193089"');
    expect(bootstrap).toContain('ref == "refs/heads/main"');
    expect(bootstrap).toContain(".github/workflows/firebase-hosting.yml@refs/heads/main");
    expect(bootstrap).not.toMatch(/keys\s+create|service-account-key|credentials\.json/iu);
  });
});
