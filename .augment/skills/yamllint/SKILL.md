---
name: yamllint
description: Lint YAML files with yamllint to catch syntax errors, formatting inconsistencies, and style issues. Use when creating or modifying YAML files (GitHub Actions workflows, Firebase/CI config, .yml/.yaml), validating YAML before committing, or enforcing consistent YAML style across the repository.
---

# yamllint

Validate YAML files against syntax and style rules using
[`yamllint`](https://yamllint.readthedocs.io/). Follow the prerequisite
check → run → report workflow below.

## When to use

- Creating or modifying any `.yml` / `.yaml` file (for example
  `.github/workflows/*.yml`).
- Validating YAML before committing or opening a pull request.
- Enforcing consistent YAML formatting across the repository.

## 1. Check the prerequisite

`yamllint` is a Python tool. Confirm it is available before running:

```bash
yamllint --version
```

If that fails, try invoking it through the Python launcher / module:

```bash
py -m yamllint --version    # Windows (Python Install Manager)
python -m yamllint --version
```

### Install if missing

Install globally with pip (preferred in this environment, matches the
Python Install Manager setup):

```bash
py -m pip install yamllint    # Windows
python -m pip install yamllint
```

Or, to keep it isolated, use pipx:

```bash
pipx install yamllint
```

## 2. Run

Lint the whole repository (respects a config file if present, see below):

```bash
yamllint .
```

Lint specific files or a directory:

```bash
yamllint .github/workflows/
yamllint firebase.json.yml path/to/file.yaml
```

Use the parsable format when you need machine-readable output (one issue
per line, `file:line:col: [level] message (rule)`):

```bash
yamllint -f parsable .
```

Treat warnings as errors (useful for CI gating):

```bash
yamllint --strict .
```

## 3. Configuration

`yamllint` looks for a config file in this order: `.yamllint`,
`.yamllint.yaml`, or `.yamllint.yml` in the working directory, then
`YAMLLINT_CONFIG_FILE`, then `~/.config/yamllint/config`. If none exists,
the built-in `default` preset is used.

To add a project config, create `.yamllint.yml` at the repo root. A common
starting point that extends the defaults but relaxes line length:

```yaml
extends: default
rules:
  line-length:
    max: 120
    level: warning
  document-start: disable
```

Only add a config file if the user asks for one or the defaults produce
noise that does not reflect the project's intent. Do not create config
files speculatively.

## 4. Report

Summarize results for the user:

- If clean, state that all YAML files pass.
- If issues exist, list them grouped by file with line/column, the rule
  name, and whether each is an error or warning.
- Fix genuine problems (indentation, trailing spaces, duplicate keys,
  syntax errors) directly. For style-only findings, propose the fix or a
  config adjustment rather than silently rewriting the user's files.

## Notes

- `yamllint` checks style and syntax; it does not validate a file against a
  specific schema (for example GitHub Actions semantics). Pair it with a
  schema-aware validator when semantic correctness matters.
- Exit code is non-zero when errors are found (and when warnings are found
  under `--strict`), which makes it suitable for pre-commit hooks and CI.
