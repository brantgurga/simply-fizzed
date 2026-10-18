// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(path, "utf8");
const workflow = read(".github/workflows/firebase-hosting.yml");
const moduleMain = read("infra/modules/firebase/main.tf");
const productionImports = read("infra/environments/production/imports.tf");
const bootstrapScript = resolve("scripts/bootstrap-firebase-project.sh");

const runtimeParameters = [
  "GET_MY_AUTHORIZATION_SERVICE_ACCOUNT",
  "SEARCH_USERS_SERVICE_ACCOUNT",
  "REVEAL_USER_EMAIL_SERVICE_ACCOUNT",
  "SAVE_MY_PROFILE_SERVICE_ACCOUNT",
  "APPLY_USER_MANAGEMENT_SERVICE_ACCOUNT",
  "GET_USER_AUDIT_HISTORY_SERVICE_ACCOUNT",
  "RECORD_ACCOUNT_CREATION_SERVICE_ACCOUNT",
  "REPORT_REVIEW_SERVICE_ACCOUNT",
  "MODERATE_REVIEW_SERVICE_ACCOUNT",
  "LOAD_REVIEW_MODERATION_QUEUE_SERVICE_ACCOUNT",
  "PROCESS_REVIEW_REVISION_SERVICE_ACCOUNT",
  "PROCESS_REVIEW_RATING_SERVICE_ACCOUNT",
];

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
  });

  it("keeps exact existing account imports in the production root", () => {
    expect(productionImports).toContain("import {");
    for (const parameter of runtimeParameters) expect(productionImports).toContain(parameter);
    for (const accountId of [
      "get-my-authorization",
      "search-users",
      "reveal-user-email",
      "save-my-profile",
      "apply-user-management",
      "get-user-audit-history",
      "record-account-creation",
      "report-review",
      "moderate-review",
      "load-review-moderation-queue",
      "process-review-revision",
      "process-review-rating",
    ]) {
      expect(productionImports).toContain(`= "${accountId}"`);
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

describe("administrator bootstrap contracts", () => {
  const bootstrap = read("scripts/bootstrap-firebase-project.sh");

  it("rejects invalid project IDs before invoking cloud tools", () => {
    const result = spawnSync("bash", [bootstrapScript, "INVALID_PROJECT"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("PROJECT_ID");
  });

  it("hardens remote state and repository federation without keys", () => {
    expect(bootstrap).toContain("--versioning");
    expect(bootstrap).toContain("--public-access-prevention");
    expect(bootstrap).toContain("--uniform-bucket-level-access");
    expect(bootstrap).toContain("gcloud firestore databases create");
    expect(bootstrap).toContain('repository_id == "1320193089"');
    expect(bootstrap).toContain('ref == "refs/heads/main"');
    expect(bootstrap).toContain(".github/workflows/firebase-hosting.yml@refs/heads/main");
    expect(bootstrap).not.toMatch(/keys\s+create|service-account-key|credentials\.json/iu);
  });
});
