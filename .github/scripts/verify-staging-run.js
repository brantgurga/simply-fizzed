// @ts-check

/**
 * @typedef {ReturnType<typeof import("@actions/github").getOctokit>} GitHub
 * @typedef {typeof import("@actions/github").context} Context
 * @typedef {{ setFailed: (message: string | Error) => void }} Core
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
  const approved =
    run.name === "Firebase Hosting CD" &&
    run.event === "workflow_run" &&
    run.head_branch === "main" &&
    run.conclusion === "success";
  if (!approved) {
    core.setFailed("Choose a successful main-branch Firebase Hosting CD staging run.");
    return undefined;
  }

  const { data: latest } = await github.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: run.workflow_id,
    branch: "main",
    event: "workflow_run",
    status: "success",
    per_page: 1,
  });
  if (latest.workflow_runs[0]?.id !== runId) {
    core.setFailed("Only the latest successful staging run can be promoted.");
    return undefined;
  }

  return run.head_sha;
}
