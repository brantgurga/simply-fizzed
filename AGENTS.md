# Repository instructions

## Development approach

- Treat tests as executable requirements. Reproduce defects with a failing test
  before fixing them, and add tests before or alongside new behavior.
- Cover both successful, non-exception paths and exception or error paths,
  including relevant boundaries and regressions.
- Prefer changing production code while preserving valid tests. Change a test
  only when the requirement changed or the test is incorrect, and explain why.

## Interface compatibility

- Evolve public and shared interfaces compatibly.
- Before making a breaking change, find and update every caller. If all callers
  cannot be proven updated, retain and deprecate the old interface while adding
  its replacement.
- Test both the supported compatibility path and the replacement during a
  migration.

## Command execution

- For commands invoked directly by an agent, prefer compact commands, short
  options, narrow targets, and compact or filtered output. Request only the
  fields and lines needed for the current decision.
- If a compact command fails or omits required diagnostic detail, rerun it with
  progressively more verbose output. Do not start with noisy output by default.
- The short-option preference applies only to direct, transient agent
  invocations. In pipelines, scripts, package commands, and documentation,
  prefer self-documenting long option names and output that gives future readers
  enough context.

## Scoped guidance

- For HTML, CSS, or client-side JavaScript changes, follow
  `.agents/guidance/web.md`.
- For GitHub Actions workflow or local action changes, follow
  `.agents/guidance/github-actions.md`.

## Validation and review

- Add or update tests for changed behavior and run the relevant focused tests
  while developing.
- Before opening a pull request, run the checks listed in `CONTRIBUTING.md`.
- Review the final diff against these instructions and every applicable scoped
  guidance file.
