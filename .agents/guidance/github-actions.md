# GitHub Actions change guidance

Apply this guidance only when changing a GitHub Actions workflow or local action.

## Dependency locking

- After adding, removing, or updating a workflow `uses` dependency, or changing
  a workflow or local action file, run `gh actions-lock` from the repository
  root and commit the resulting workflow and `.github/workflows/actions.lock`
  changes together.
- Never edit `.github/workflows/actions.lock` manually. Review changed commit,
  owner, and repository IDs as security-sensitive dependency changes.
- If an upstream ref legitimately moved, inspect its history before running
  `gh actions-lock --relock`; use `--accept-moved` only after explicitly
  confirming that the replacement commit is trusted.
