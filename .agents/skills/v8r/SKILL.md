---
name: v8r
description: Validate JSON, JSONC, YAML, and TOML config files against their JSON Schema using v8r, which auto-detects schemas by filename via SchemaStore.org. Use when creating or modifying schema-backed config files (package.json, tsconfig*.json, firebase.json), or when you want to confirm a config is semantically valid, not just well-formed.
---

# v8r

Validate config files against their [JSON Schema](https://json-schema.org)
using [`v8r`](https://chris48s.github.io/v8r/). v8r matches each file to a
schema **by filename** through [SchemaStore.org](https://www.schemastore.org),
then validates the file's contents. This catches semantic errors (wrong types,
unknown keys, invalid enum values) that a syntax linter cannot. Follow the
prerequisite check → run → report workflow below.

## When to use

- Creating or modifying a schema-backed config: `package.json`,
  `tsconfig*.json`, `firebase.json`.
- Confirming a config is semantically valid before committing, beyond being
  well-formed JSON/YAML.
- Complementing structural linting (see the `biome` skill) with schema-aware
  validation.

## 1. Check the prerequisite

v8r is a Node.js tool and requires **Node ≥ 22**. Prefer running it through
`npx` without a permanent install. It has a version flag:

```bash
npx v8r@6.1.0 --version
```

Pin the version (`@6.1.0`) so local and CI runs match.

### Install if missing

Preferred (isolated, no install) via `npx` — downloads on demand:

```bash
npx --yes v8r@6.1.0
```

As a project dev dependency (ask before adding a dependency):

```bash
npm install --save-dev v8r@6.1.0
```

## 2. Run

Validate the curated file list from `.v8rrc.yml` (invoked with no arguments):

```bash
npx --yes v8r@6.1.0
```

Validate one or more specific files (positional args override config
patterns):

```bash
npx --yes v8r@6.1.0 package.json tsconfig.json
```

Use JSON output when you need machine-readable results:

```bash
npx --yes v8r@6.1.0 --output-format json
```

## 3. Configuration

v8r loads config via cosmiconfig; this repo uses `.v8rrc.yml`. Key points:

- **`patterns`** lists only files that have a resolvable public schema. v8r
  treats "no schema found" as a failure, so listing schema-backed files
  explicitly keeps a missing schema from breaking the run. Files without a
  published schema (for example `firestore.indexes.json`) are omitted, and the
  oxc tool configs (`.oxlintrc.json`, `.oxfmtrc.json`) are left to their own
  bundled `$schema` plus Biome's structural checks.
- **`customCatalog`** is searched ahead of SchemaStore. The `tsconfig*` family
  permits JSONC comments, so it is mapped to the public TSConfig schema with
  `parser: json5` (which allows comments); v8r would otherwise infer the strict
  JSON parser from the `.json` extension and fail on the comments.

Resolution order is: `--schema` flag → `customCatalog` → `--catalogs` →
SchemaStore. v8r does **not** read a file's in-document `$schema` property; it
matches by filename.

## 4. Report

Summarize results for the user:

- If clean, state that all listed files validate against their schemas.
- If a file is invalid, quote the schema path and message v8r prints (for
  example a type mismatch or an unexpected property) and fix the config.
- If v8r cannot find a schema for a file you expected it to validate, add a
  `customCatalog` entry or adjust `patterns` rather than ignoring the error.

## Notes

- v8r validates semantics; pair it with `biome` (JSON/JSONC structure and
  duplicate keys) and `yamllint` (YAML style) for full coverage.
- Some schemas use non-standard `format` values (for example the oxc schemas
  use `uint32`); ajv prints harmless "unknown format ... ignored" notices for
  those and still validates.
- Exit code is non-zero when a file is invalid or no schema is found, which
  makes it suitable for pre-commit hooks and CI.
