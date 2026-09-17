---
name: markdownlint-cli2
description: Lint and auto-fix Markdown files with markdownlint-cli2 to enforce consistent formatting and catch common Markdown issues. Use when creating or modifying .md/.markdown files (README, docs, SKILL.md), validating documentation before committing, or enforcing Markdown style across the repository.
---

# markdownlint-cli2

Validate Markdown against formatting standards using
[`markdownlint-cli2`](https://github.com/DavidAnson/markdownlint-cli2), the
configuration-first CLI for
[markdownlint](https://github.com/DavidAnson/markdownlint). Follow the
prerequisite check → run → report workflow below.

## When to use

- Creating or modifying any `.md` / `.markdown` file (README, docs,
  `SKILL.md`, changelogs).
- Validating documentation before committing or opening a pull request.
- Enforcing consistent Markdown formatting across the repository.

## 1. Check the prerequisite

`markdownlint-cli2` is a Node.js tool. This repository already uses Node and
npm, so prefer running it through `npx` without a permanent install:

```bash
npx markdownlint-cli2 --version
```

If it is installed as a project dev dependency, an `npm` script or direct
binary works too:

```bash
npx markdownlint-cli2 "**/*.md"
```

### Install if missing

Preferred (isolated, no install) via `npx` — downloads on demand:

```bash
npx --yes markdownlint-cli2 "**/*.md"
```

As a project dev dependency (ask before adding a dependency):

```bash
npm install --save-dev markdownlint-cli2
```

Globally (only if the user wants it available everywhere):

```bash
npm install --global markdownlint-cli2
```

## 2. Run

Check Markdown files with a glob (quote globs so the shell does not expand
them):

```bash
npx markdownlint-cli2 "**/*.md"
```

Auto-fix the issues that are safely fixable, then re-run to see what
remains:

```bash
npx markdownlint-cli2 --fix "**/*.md"
```

Exclude generated or vendored paths using `#`-prefixed negation globs or a
config `ignores` entry (see below):

```bash
npx markdownlint-cli2 "**/*.md" "#node_modules" "#dist"
```

## 3. Configuration

`markdownlint-cli2` reads configuration from (in order of precedence)
`.markdownlint-cli2.jsonc`, `.markdownlint-cli2.yaml`,
`.markdownlint-cli2.cjs`, then base `markdownlint` config files
`.markdownlint.jsonc` / `.markdownlint.json` / `.markdownlint.yaml`. Without
a config file, all default rules are enabled.

To add project config, create `.markdownlint-cli2.jsonc` at the repo root.
A common starting point that keeps defaults but relaxes line length and
ignores build output:

```jsonc
{
  "config": {
    "default": true,
    "MD013": { "line_length": 120 },
  },
  "ignores": ["node_modules", "dist", "playwright-report"],
}
```

Only add a config file if the user asks for one or the defaults produce
noise that does not fit the project. Do not create config files
speculatively.

## 4. Report

Summarize results for the user:

- If clean, state that all Markdown files pass.
- If issues exist, list them grouped by file with line/column, the rule id
  (for example `MD013/line-length`), and a short description.
- Run `--fix` first to clear mechanical issues, then address the remaining
  findings manually (these usually need judgement, such as heading levels
  or link text). Do not disable rules to silence findings unless the user
  agrees.

## Notes

- markdownlint rule reference:
  <https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md>.
- Exit code is non-zero when unfixed issues remain, which makes it suitable
  for pre-commit hooks and CI.
- Related community skills target the older generic `markdownlint` CLI (for
  example `rshade/agent-skills@markdownlint`); this skill is tailored to the
  config-first `markdownlint-cli2` used here.
