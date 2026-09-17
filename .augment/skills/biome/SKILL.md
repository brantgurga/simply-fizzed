---
name: biome
description: Lint JSON and JSONC files with Biome to catch structural problems such as duplicate object keys and syntax errors. Use when creating or modifying .json/.jsonc files (tsconfig, package.json, tool configs), validating JSON/JSONC before committing, or enforcing JSON correctness across the repository. In this repo Biome is scoped to JSON/JSONC linting only; formatting is owned by oxfmt.
---

# biome

Lint JSON and JSONC using [Biome](https://biomejs.dev), a fast Rust-based
toolchain. In this repository Biome is used **only as a JSON/JSONC linter**
(duplicate keys, syntax, structural issues). Its formatter is disabled so it
never competes with `oxfmt`, and JavaScript/TypeScript stay out of scope
because `oxlint` handles those. Follow the prerequisite check → run → report
workflow below.

## When to use

- Creating or modifying any `.json` / `.jsonc` file (`tsconfig*.json`,
  `package.json`, `firebase.json`, `.oxlintrc.json`, `.markdownlint-cli2.jsonc`).
- Validating JSON/JSONC before committing or opening a pull request.
- Catching duplicate object keys, which strict JSON allows to parse silently
  but which are almost always a bug.

## 1. Check the prerequisite

Biome is a Node.js tool. This repository already uses Node and npm, so prefer
running it through `npx` without a permanent install. It has a real version
flag:

```bash
npx @biomejs/biome@2.5.14 --version
```

Pin the version (`@2.5.14`) so local and CI runs match.

### Install if missing

Preferred (isolated, no install) via `npx` — downloads on demand:

```bash
npx --yes @biomejs/biome@2.5.14 lint
```

As a project dev dependency (ask before adding a dependency):

```bash
npm install --save-dev @biomejs/biome@2.5.14
```

## 2. Run

Lint every in-scope JSON/JSONC file (globs and ignores come from
`biome.json`):

```bash
npx --yes @biomejs/biome@2.5.14 lint
```

Apply the safe, automatic fixes, then re-run to see what remains:

```bash
npx --yes @biomejs/biome@2.5.14 lint --write
```

Lint a specific file or directory:

```bash
npx --yes @biomejs/biome@2.5.14 lint tsconfig.node.json
```

## 3. Configuration

Biome reads `biome.json` (or `biome.jsonc`) from the repo root. The config in
this repository intentionally:

- **Disables the formatter** (`formatter.enabled: false` and
  `json.formatter.enabled: false`) so `oxfmt` remains the sole formatter.
- **Enables the linter** with the default recommended rules (which include
  `noDuplicateObjectKeys`).
- **Scopes `files.includes` to JSON/JSONC only** and excludes generated or
  vendored paths (`node_modules`, `dist`, `playwright-report`, `test-results`)
  and `package-lock.json`.

Biome parses well-known comment-bearing files (for example the `tsconfig*.json`
family) as JSONC automatically, and treats `.jsonc` files as JSONC. Plain
`.json` files stay strict, so an accidental comment in `package.json` is still
flagged.

Do not enable Biome's formatter or widen its scope to JS/TS/CSS in this repo —
that would duplicate or conflict with `oxfmt` and `oxlint`.

## 4. Report

Summarize results for the user:

- If clean, state that all JSON/JSONC files pass.
- If issues exist, list them grouped by file with line/column, the rule id
  (for example `lint/suspicious/noDuplicateObjectKeys`), and a short
  description.
- Run `lint --write` first to clear mechanical issues, then address the rest
  manually. Do not disable rules to silence findings unless the user agrees.

## Notes

- `oxlint` does not yet lint JSON/JSONC (oxc-project/oxc#18656), which is why
  Biome fills that gap here.
- Biome pairs with `v8r`: Biome checks structure/syntax, while `v8r` validates
  files against their JSON Schema.
- Exit code is non-zero when unfixed lint errors remain, which makes it
  suitable for pre-commit hooks and CI.
