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
const terraformApplyWorkflow = read(".github/workflows/terraform-apply.yml");
const terraformPlanMatch = workflow.match(
  /      - name: Terraform plan\n[\s\S]*?        run: \|\n(?<script>(?:          .*\n)+)\n      - name: Publish Terraform plan/u,
);
if (!terraformPlanMatch?.groups?.["script"]) {
  throw new Error("The Terraform plan script is missing from the delivery workflow.");
}
const terraformPlanScript = terraformPlanMatch.groups["script"].replace(/^ {10}/gmu, "");
const moduleMain = read("infra/modules/firebase/main.tf");
const productionImports = read("infra/environments/production/imports.tf");
const bootstrapScript = resolve("scripts/bootstrap-firebase-project.sh");
const bootstrapArguments = [
  bootstrapScript,
  "valid-project",
  "--workload-identity-provider",
  "projects/123456789/locations/global/workloadIdentityPools/existing-pool/providers/github",
  "--folder",
  "987654321",
];
const expectedManagedRoles = [
  "projects/valid-project/roles/terraformFirestoreAdmin",
  "roles/cloudfunctions.admin",
  "roles/datastore.indexAdmin",
  "roles/datastore.user",
  "roles/datastore.viewer",
  "roles/eventarc.eventReceiver",
  "roles/firebaseauth.editor",
  "roles/firebaseauth.viewer",
  "roles/firebasehosting.admin",
  "roles/firebaserules.admin",
  "roles/iam.serviceAccountAdmin",
  "roles/iam.serviceAccountUser",
  "roles/run.invoker",
  "roles/serviceusage.apiKeysViewer",
  "roles/serviceusage.serviceUsageAdmin",
  "roles/serviceusage.serviceUsageConsumer",
];

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
  it("keeps generic version pins consistent across configuration", () => {
    const versions = read("infra/environments/production/versions.tf");
    const lock = read("infra/environments/production/.terraform.lock.hcl");
    const terraformVersion = versions.match(/required_version\s*=\s*"= (\d+\.\d+\.\d+)"/u)?.[1];
    const googleConstraint = versions.match(
      /source\s*=\s*"hashicorp\/google"[\s\S]*?version\s*=\s*"(~> \d+\.\d+\.\d+)"/u,
    )?.[1];

    expect(terraformVersion).toBeDefined();
    expect(googleConstraint).toBeDefined();
    expect(workflow).toContain(`terraform_version: ${terraformVersion}`);
    expect(lock).toContain('provider "registry.terraform.io/hashicorp/google"');
    expect(lock).toContain(googleConstraint);
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
    expect(moduleMain.match(/\n      description\s+=/gu)).toHaveLength(12);
    expect(moduleMain).not.toMatch(/display_name\s*=\s*"[^"]* Function"/u);
    expect(moduleMain).not.toContain('"roles/resourcemanager.projectIamAdmin",');
    expect(moduleMain).toContain("firebase-functions-default-service-account");
    expect(moduleMain).toContain('resource "google_firestore_database" "default"');
    expect(moduleMain).toContain('delete_protection_state = "DELETE_PROTECTION_ENABLED"');
  });

  it("uses implicit API dependencies instead of explicit graph edges", () => {
    expect(moduleMain).not.toContain("depends_on");
    expect(moduleMain).toContain(
      'project                 = google_project_service.required["firestore.googleapis.com"].project',
    );
    expect(moduleMain).toContain(
      'project      = google_project_service.required["iam.googleapis.com"].project',
    );
    expect(moduleMain).toContain(
      'project = google_project_service.required["cloudresourcemanager.googleapis.com"].project',
    );
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
    expect(productionImports).toContain("var.import_existing_production_resources ?");
    expect(productionImports).toContain("module.firebase.google_firestore_database.default");
    expect(productionImports).toContain('id = "projects/${each.value}/databases/(default)"');
    expect(moduleMain).not.toContain("import {");
  });
});

describe("Terraform Firebase delivery contracts", () => {
  it("publishes changed plans for an explicit run-ID approval", () => {
    const planStart = workflow.indexOf("  terraform-plan:");
    const verifyStart = workflow.indexOf("  verify-terraform-plan:");
    const deployStart = workflow.indexOf("  deploy-staging:");
    const planJob = workflow.slice(planStart, verifyStart);
    const deployJob = workflow.slice(deployStart, workflow.indexOf("  promote-production:"));

    expect(planStart).toBeGreaterThan(0);
    expect(verifyStart).toBeGreaterThan(planStart);
    expect(deployStart).toBeGreaterThan(verifyStart);
    expect(planJob).toContain("terraform plan -input=false -detailed-exitcode");
    expect(planJob).toContain("Publish Terraform plan for approval");
    expect(planJob).toContain("terraform show -no-color production.tfplan");
    expect(planJob).toContain("Run ID to approve for Terraform apply: $GITHUB_RUN_ID");
    expect(planJob).toContain("name: terraform-production-plan");
    expect(planJob).toContain("if: ${{ steps.plan.outputs.has_changes == 'true' }}");
    expect(planJob).not.toMatch(/\n\s+environment:/u);
    expect(deployJob).toContain("needs.terraform-plan.outputs.has_changes == 'false'");
  });

  it("applies an approved saved plan before deploying its staging artifact", () => {
    expect(terraformApplyWorkflow).toContain("workflow_dispatch:");
    expect(terraformApplyWorkflow).toContain("terraform_plan_run_id:");
    expect(terraformApplyWorkflow).toContain("required: true");
    expect(terraformApplyWorkflow).toContain("uses: ./.github/workflows/firebase-hosting.yml");
    expect(terraformApplyWorkflow).toContain("apply_terraform: true");
    expect(terraformApplyWorkflow).toContain(
      "artifact_run_id: ${{ inputs.terraform_plan_run_id }}",
    );

    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("verify-terraform-plan-run.js");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("Download approved Terraform plan");
    expect(workflow).toContain("terraform apply production.tfplan");
    expect(workflow.indexOf("terraform apply production.tfplan")).toBeLessThan(
      workflow.indexOf("Read Terraform deployment outputs"),
    );
    expect(workflow).not.toContain("production-infrastructure");
    expect(workflow).toContain("inputs.staging_run_id != ''");
  });

  it.each([
    [0, 0, "has_changes=false\n"],
    [2, 0, "has_changes=true\n"],
    [42, 42, ""],
  ])("maps Terraform plan exit code %i to the expected result", (planStatus, status, output) => {
    const root = mkdtempSync(join(tmpdir(), "terraform-plan-"));
    const terraform = join(root, "terraform");
    const githubOutput = join(root, "github-output");
    writeFileSync(terraform, '#!/usr/bin/env bash\n: > production.tfplan\nexit "$MOCK_STATUS"\n');
    writeFileSync(githubOutput, "");
    chmodSync(terraform, 0o755);

    try {
      const result = spawnSync("bash", ["-c", terraformPlanScript], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: githubOutput,
          MOCK_STATUS: String(planStatus),
          PATH: `${root}:${process.env["PATH"]}`,
        },
      });
      expect(result.status).toBe(status);
      expect(readFileSync(githubOutput, "utf8")).toBe(output);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
if [[ "$tool" == jq ]]; then cat >/dev/null; [[ -f "$MOCK_STATE/firebase" ]]; exit; fi
if [[ "$tool" == firebase ]]; then
  if [[ "$1" == projects:list ]]; then echo '{}'; else touch "$MOCK_STATE/firebase"; fi
  exit
fi
args="$*"
case "$args" in
  "projects describe "*) [[ -f "$MOCK_STATE/project" ]]; exit ;;
  "projects create "*) touch "$MOCK_STATE/project" ;;
  "storage buckets describe "*) [[ -f "$MOCK_STATE/bucket" ]]; exit ;;
  "storage buckets create "*) touch "$MOCK_STATE/bucket" ;;
  "iam roles describe "*) [[ -f "$MOCK_STATE/database-role" ]]; exit ;;
  "iam roles create "*) touch "$MOCK_STATE/database-role" ;;
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
      const first = spawnSync("bash", bootstrapArguments, {
        encoding: "utf8",
        env: mock.env,
      });
      const second = spawnSync("bash", bootstrapArguments, {
        encoding: "utf8",
        env: mock.env,
      });
      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);
      const commands = readFileSync(mock.log, "utf8");
      for (const creation of [
        "gcloud projects create",
        "gcloud storage buckets create",
        "gcloud iam roles create",
        "gcloud iam service-accounts create",
        "firebase projects:addfirebase",
      ]) {
        const matchingCommands = commands
          .split("\n")
          .filter((command) => command.startsWith(creation));
        expect(matchingCommands, `${creation}\n${commands}`).toHaveLength(1);
      }
      expect(commands).toContain(
        "gcloud projects create valid-project --name=valid-project --folder=987654321",
      );
      expect(commands).not.toContain("gcloud config set project");
      expect(commands).not.toContain("firestore.googleapis.com");
      expect(commands).not.toContain("firebase.googleapis.com");
      expect(commands).not.toContain("workload-identity-pools create");
      expect(commands).toContain("gcloud iam roles update terraformFirestoreAdmin");
      const iamAdminBindings = commands
        .split("\n")
        .filter((command) => command.includes("--role=roles/resourcemanager.projectIamAdmin"));
      expect(iamAdminBindings).toHaveLength(2);
      for (const command of iamAdminBindings) {
        expect(command).toContain("]) || api.getAttribute(");
        const roleLists = [...command.matchAll(/hasOnly\(\[([^\]]*)\]\)/gu)];
        const managedRoles = roleLists.flatMap((roleList) =>
          [...(roleList[1] ?? "").matchAll(/'([^']+)'/gu)].map((match) => match[1]),
        );
        expect(managedRoles).toEqual(expectedManagedRoles);
        for (const roleList of roleLists) {
          expect([...(roleList[1] ?? "").matchAll(/'[^']+'/gu)].length).toBeLessThanOrEqual(10);
        }
      }
    } finally {
      rmSync(mock.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["gcloud services enable", "firebase projects:list"],
    ["gcloud projects add-iam-policy-binding", "gcloud storage buckets add-iam-policy-binding"],
  ])("reports %s failures and stops immediately", (failedCommand, skippedCommand) => {
    const mock = createMockCloudTools();
    try {
      const result = spawnSync("bash", bootstrapArguments, {
        encoding: "utf8",
        env: { ...mock.env, MOCK_FAIL: failedCommand },
      });
      expect(result.status).toBe(42);
      expect(result.stderr).toContain("Bootstrap failed at line");
      expect(result.stderr).toContain("(exit 42)");
      expect(readFileSync(mock.log, "utf8")).not.toContain(skippedCommand);
    } finally {
      rmSync(mock.root, { recursive: true, force: true });
    }
  });

  it("hardens state and consumes dedicated-project federation without keys", () => {
    expect(bootstrap).toContain("--versioning");
    expect(bootstrap).toContain("--public-access-prevention");
    expect(bootstrap).toContain("--uniform-bucket-level-access");
    expect(bootstrap).toContain("roles/storage.objectUser");
    expect(bootstrap).not.toContain("roles/storage.objectAdmin");
    expect(bootstrap).toContain("modifiedGrantsByRole");
    expect(bootstrap).toContain("terraform-managed-roles");
    expect(bootstrap).toContain("--workload-identity-provider");
    expect(bootstrap).toContain("principalSet://iam.googleapis.com/projects/");
    expect(bootstrap).not.toContain("workload-identity-pools create");
    expect(bootstrap).not.toMatch(/keys\s+create|service-account-key|credentials\.json/iu);
  });
});
