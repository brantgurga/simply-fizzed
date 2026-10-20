// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

import { afterEach, describe, expect, it, vi } from "vitest";

import verifyStagingRun from "./verify-staging-run.js";
import verifyTerraformPlanRun from "./verify-terraform-plan-run.js";

const context = { repo: { owner: "brantgurga", repo: "simply-fizzed" } };
const repository = { full_name: "brantgurga/simply-fizzed" };

const createCore = () => ({ setFailed: vi.fn() });

const createTerraformGitHub = ({
  run = {
    id: 42,
    name: "Firebase Hosting CD",
    event: "workflow_run",
    head_branch: "main",
    head_repository: repository,
    conclusion: "success",
    workflow_id: 7,
    head_sha: "abc123",
  },
  latestRunId = 42,
  artifacts = [
    { name: "firebase-hosting", expired: false },
    { name: "terraform-production-plan", expired: false },
  ],
} = {}) => ({
  rest: {
    actions: {
      getWorkflowRun: vi.fn().mockResolvedValue({ data: run }),
      listWorkflowRuns: vi.fn().mockResolvedValue({
        data: { workflow_runs: [{ id: latestRunId }] },
      }),
      listWorkflowRunArtifacts: vi.fn().mockResolvedValue({ data: { artifacts } }),
    },
  },
});

const createStagingGitHub = ({
  run = {
    id: 84,
    name: "Terraform Apply",
    event: "workflow_dispatch",
    head_branch: "main",
    head_repository: repository,
    conclusion: "success",
    head_sha: "def456",
  },
  latestRuns = /** @type {Array<Record<string, unknown>>} */ ([]),
} = {}) => {
  const listJobsForWorkflowRun = vi.fn().mockResolvedValue({
    data: { jobs: [{ name: "Deploy staging channel", conclusion: "success" }] },
  });
  return {
    paginate: vi.fn().mockResolvedValue(latestRuns.length > 0 ? latestRuns : [run]),
    rest: {
      actions: {
        getWorkflowRun: vi.fn().mockResolvedValue({ data: run }),
        listJobsForWorkflowRun,
        listWorkflowRunsForRepo: vi.fn(),
      },
    },
  };
};

/**
 * @param {unknown} github
 * @param {unknown} core
 */
const verifyTerraform = (github, core) => {
  // @ts-expect-error Focused test doubles implement only the API methods under test.
  return verifyTerraformPlanRun({ github, context, core });
};

/**
 * @param {unknown} github
 * @param {unknown} core
 */
const verifyStaging = (github, core) => {
  // @ts-expect-error Focused test doubles implement only the API methods under test.
  return verifyStagingRun({ github, context, core });
};

afterEach(() => {
  delete process.env["TERRAFORM_PLAN_RUN_ID"];
  delete process.env["STAGING_RUN_ID"];
});

describe("Terraform plan approval verification", () => {
  it("accepts the latest successful run with unexpired plan and build artifacts", async () => {
    process.env["TERRAFORM_PLAN_RUN_ID"] = "42";
    const core = createCore();

    await expect(verifyTerraform(createTerraformGitHub(), core)).resolves.toBe("abc123");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("rejects a stale plan run", async () => {
    process.env["TERRAFORM_PLAN_RUN_ID"] = "42";
    const core = createCore();

    await expect(
      verifyTerraform(createTerraformGitHub({ latestRunId: 43 }), core),
    ).resolves.toBeUndefined();
    expect(core.setFailed).toHaveBeenCalledWith(
      "Only the latest completed Firebase Hosting CD plan can be applied.",
    );
  });

  it("rejects a run without an available saved plan", async () => {
    process.env["TERRAFORM_PLAN_RUN_ID"] = "42";
    const core = createCore();

    await expect(
      verifyTerraform(
        createTerraformGitHub({
          artifacts: [{ name: "firebase-hosting", expired: false }],
        }),
        core,
      ),
    ).resolves.toBeUndefined();
    expect(core.setFailed).toHaveBeenCalledWith(
      "The selected run does not contain an unexpired Terraform plan and build.",
    );
  });
});

describe("staging deployment approval verification", () => {
  it("accepts staging deployed after an approved Terraform apply", async () => {
    process.env["STAGING_RUN_ID"] = "84";
    const core = createCore();

    await expect(verifyStaging(createStagingGitHub(), core)).resolves.toBe("def456");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("rejects a run superseded by a newer staging deployment", async () => {
    process.env["STAGING_RUN_ID"] = "84";
    const core = createCore();
    const selected = {
      id: 84,
      name: "Terraform Apply",
      event: "workflow_dispatch",
      head_branch: "main",
      head_repository: repository,
      conclusion: "success",
      head_sha: "def456",
    };
    const newer = { ...selected, id: 85, head_sha: "fed987" };

    await expect(
      verifyStaging(createStagingGitHub({ run: selected, latestRuns: [newer, selected] }), core),
    ).resolves.toBeUndefined();
    expect(core.setFailed).toHaveBeenCalledWith(
      "Only the latest successful staging deployment can be promoted.",
    );
  });
});
