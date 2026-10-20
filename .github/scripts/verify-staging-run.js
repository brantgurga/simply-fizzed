// Copyright (C) 2026 Brant Langer Gurganus
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE for copying terms.

// @ts-check

/**
 * @typedef {ReturnType<typeof import("@actions/github").getOctokit>} GitHub
 * @typedef {typeof import("@actions/github").context} Context
 * @typedef {{ setFailed: (message: string | Error) => void }} Core
 * @typedef {Awaited<ReturnType<GitHub["rest"]["actions"]["listJobsForWorkflowRun"]>>["data"]["jobs"]} WorkflowJobs
 */

/**
 * Verifies that the requested run is the latest successful staging deployment.
 *
 * @param {{ github: GitHub, context: Context, core: Core }} options
 * @returns {Promise<string | undefined>} The approved commit SHA.
 */
export default async function verifyStagingRun({ github, context, core }) {
  const runId = Number(process.env["STAGING_RUN_ID"]);
  if (!Number.isSafeInteger(runId) || runId <= 0) {
    core.setFailed("The staging run ID must be a positive integer.");
    return undefined;
  }

  const { data: run } = await github.rest.actions.getWorkflowRun({
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: runId,
  });
  const expectedRepository = `${context.repo.owner}/${context.repo.repo}`;
  const isStagingWorkflow =
    (run.name === "Firebase Hosting CD" && run.event === "workflow_run") ||
    (run.name === "Terraform Apply" && run.event === "workflow_dispatch");
  const approved =
    isStagingWorkflow &&
    run.head_branch === "main" &&
    run.head_repository?.full_name === expectedRepository &&
    run.conclusion === "success";
  if (!approved) {
    core.setFailed("Choose a successful main-branch staging deployment run.");
    return undefined;
  }

  /** @type {Map<number, WorkflowJobs>} */
  const jobsByRun = new Map();
  /** @param {number} candidateRunId */
  const hasSuccessfulStagingDeployment = async (candidateRunId) => {
    let jobs = jobsByRun.get(candidateRunId);
    if (!jobs) {
      const response = await github.rest.actions.listJobsForWorkflowRun({
        owner: context.repo.owner,
        repo: context.repo.repo,
        run_id: candidateRunId,
        per_page: 100,
      });
      jobs = response.data.jobs;
      jobsByRun.set(candidateRunId, jobs);
    }
    return jobs.some(
      (job) =>
        (job.name === "Deploy staging channel" || job.name.endsWith(" / Deploy staging channel")) &&
        job.conclusion === "success",
    );
  };
  if (!(await hasSuccessfulStagingDeployment(runId))) {
    core.setFailed("The selected run did not successfully deploy the staging channel.");
    return undefined;
  }

  const runs = await github.paginate(github.rest.actions.listWorkflowRunsForRepo, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    branch: "main",
    status: "success",
    per_page: 100,
  });
  /**
   * @param {typeof runs} candidates
   * @param {number} index
   * @returns {Promise<number | undefined>}
   */
  const findLatestStagingRun = async (candidates, index = 0) => {
    const candidate = candidates[index];
    if (!candidate) return undefined;
    const candidateIsStagingWorkflow =
      (candidate.name === "Firebase Hosting CD" && candidate.event === "workflow_run") ||
      (candidate.name === "Terraform Apply" && candidate.event === "workflow_dispatch");
    if (candidateIsStagingWorkflow && (await hasSuccessfulStagingDeployment(candidate.id))) {
      return candidate.id;
    }
    return findLatestStagingRun(candidates, index + 1);
  };
  const latestStagingRunId = await findLatestStagingRun(runs);
  if (latestStagingRunId !== runId) {
    core.setFailed("Only the latest successful staging deployment can be promoted.");
    return undefined;
  }

  return run.head_sha;
}
