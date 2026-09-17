---
name: github-cli
description: Interact with GitHub from the terminal using the gh CLI to manage issues, pull requests, releases, workflow runs, and repository metadata. Use when creating or updating issues/PRs, checking CI status, inspecting a repo, or scripting GitHub API calls, and when secret-safe, non-destructive GitHub automation is required.
---

# GitHub CLI (gh)

Drive GitHub from the terminal with the
[`gh` CLI](https://cli.github.com/). Follow the prerequisite check → run →
report workflow below and observe the safety rules.

## When to use

- Creating or updating issues and pull requests.
- Checking CI / workflow run status for a branch, PR, or commit.
- Inspecting repository metadata, labels, releases, or comments.
- Scripting GitHub REST/GraphQL calls via `gh api`.

## 1. Check the prerequisite

Confirm the CLI is installed and authenticated:

```bash
gh --version
gh auth status
```

`gh auth status` prints the account, protocol, and token scopes. Do **not**
pass `--show-token`; the masked output is sufficient and avoids exposing the
token.

### Install if missing

- Windows: `winget install --id GitHub.cli`
- macOS: `brew install gh`
- Linux: see <https://github.com/cli/cli/blob/trunk/docs/install_linux.md>

### Authenticate if needed

```bash
gh auth login
```

Prefer interactive login or an existing keyring credential over passing
tokens on the command line.

## 2. Common workflows

Determine the current repo and default branch when needed:

```bash
gh repo view --json nameWithOwner,defaultBranchRef
```

### Issues

```bash
gh issue list --state open --limit 20
gh issue view <number>
gh issue create --title "..." --body-file <file>
gh issue comment <number> --body-file <file>
```

### Pull requests

```bash
gh pr create --base main --head <branch> --title "..." --body-file <file>
gh pr view <number> --json state,mergeable,reviewDecision
gh pr checks <number>
gh pr list --state open
```

Always create and push the branch first, and link the PR to its issue by
writing `Closes #<number>` in the PR body.

### CI / status

```bash
gh run list --branch <branch> --limit 10
gh run view <run-id>
gh pr checks <number> --watch
```

### Raw API (when no porcelain command exists)

```bash
gh api repos/{owner}/{repo}/issues --method GET -f state=open
gh api --input <file> repos/{owner}/{repo}/issues   # POST from a JSON file
```

## 3. Report

Summarize what changed for the user: issue/PR numbers and URLs, CI status
(pass/fail per check), and any follow-up needed.

## Safety rules

- **Never expose secrets.** Do not print tokens, `gh auth token`, or
  `--show-token` output. Do not echo environment variables that hold
  credentials. Refer to any secret as redacted.
- **Never merge.** Do not run `gh pr merge` (or otherwise merge/close PRs on
  the user's behalf) — leave merging to the human.
- **Bodies with backticks:** write issue/PR/comment bodies to a file and use
  `--body-file` (or `-F`) instead of inline `--body "..."`. Inline shell
  backticks trigger command substitution and corrupt the text.
- **Confirm destructive actions.** Deleting issues, branches, releases, or
  repos, and force operations, should be confirmed with the user first.
- **Scope checks:** if a command fails with a permissions error, check
  `gh auth status` token scopes rather than retrying blindly.

## Notes

- `gh` respects the repository of the current directory; pass `--repo
  owner/name` to target another repository explicitly.
- Use `--json <fields>` with `--jq` to get machine-readable output for
  scripting instead of parsing human-formatted text.
