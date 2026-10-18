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

## Web changes

- For HTML, CSS, and client-side JavaScript work, consult the installed
  `modern-web-guidance` skill before implementation.
- Review changes against all applicable guidance, especially accessibility,
  native platform capabilities, performance, browser compatibility, and
  required fallbacks. Do not force unrelated guidance into a change.
- Unless a narrower browser policy is documented, use Modern Web Guidance's
  default Baseline Widely available target.

## Validation and review

- Add or update tests for changed behavior and run the relevant focused tests
  while developing.
- Before opening a pull request, run the checks listed in `CONTRIBUTING.md`.
- Review the final diff through these instructions and the applicable Modern Web
  Guidance recommendations.
