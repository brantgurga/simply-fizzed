// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// @ts-check

/**
 * @typedef {ReturnType<typeof import("@actions/github").getOctokit>} GitHub
 * @typedef {typeof import("@actions/github").context} Context
 * @typedef {{ setFailed: (message: string | Error) => void }} Core
 */

/**
 * Verifies that a run contains the latest completed main-branch Terraform plan.
 *
 * @param {{ github: GitHub, context: Context, core: Core }} options
 * @returns {Promise<string | undefined>} The approved commit SHA.
 */
export default async function verifyTerraformPlanRun({ github, context, core }) {
  const runId = Number(process.env["TERRAFORM_PLAN_RUN_ID"]);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    core.setFailed("The Terraform plan run ID must be a positive integer.");
    return undefined;
  }

  const { data: run } = await github.rest.actions.getWorkflowRun({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: runId,
  });
  const expectedRepository = `${context.repo.owner}/${context.repo.repo}`;
  const approved =
    run.name === "Firebase Hosting CD" &&
    run.event === "workflow_run" &&
    run.head_branch === "main" &&
    run.head_repository?.full_name === expectedRepository &&
    run.conclusion === "success";
  if (!approved) {
    core.setFailed("Choose a successful main-branch Firebase Hosting CD plan run.");
    return undefined;
  }

  const { data: latest } = await github.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    event: "workflow_run",
    status: "completed",
    per_page: 1,
  });
  if (latest.workflow_runs[0]?.id !== runId) {
    core.setFailed("Only the latest completed Firebase Hosting CD plan can be applied.");
    return undefined;
  }

  const { data: artifacts } = await github.rest.actions.listWorkflowRunArtifacts({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: runId,
    per_page: 100,
  });
  const availableArtifacts = new Set(
    artifacts.artifacts.filter((artifact) => !artifact.expired).map((artifact) => artifact.name),
  );
  if (
    !availableArtifacts.has("firebase-hosting") ||
    !availableArtifacts.has("terraform-production-plan")
  ) {
    core.setFailed("The selected run does not contain an unexpired Terraform plan and build.");
    return undefined;
  }

  return run.head_sha;
}
