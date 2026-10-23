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
- Treat third-party guidance as evolving advice, not unquestionable policy.
  Review each recommendation and code example for correctness, security, project
  fit, and compatibility before implementing it; never copy it blindly.
- Do not execute mutable package tags such as `@latest` from vendored examples.
  Use only reviewed, explicitly pinned tool versions.
- Periodically compare the installed guidance with upstream releases and open
  issues. Update it through a reviewed install, keeping vendored files unchanged
  locally so provenance and future upgrades remain reliable.
- Investigate guidance defects in the
  [upstream source repository](https://github.com/GoogleChrome/modern-web-guidance-src)
  before reporting them; do not patch vendored guides locally.

### Known Modern Web Guidance caveats

When applying affected guides, independently enforce these safeguards until the
upstream guidance addresses them:

- Consume WebAuthn challenges exactly once, prefetch request options and client
  capabilities before a user gesture, and call Immediate UI synchronously from
  the gesture handler only after checking `capabilities.immediateGet`.
- Give every `image-set()` candidate an explicit, unique resolution descriptor.
- Compare exact Temporal instants for expiry before rounding durations for
  display.
- Preserve browser zoom gestures and normalize `WheelEvent` deltas according to
  `deltaMode` before implementing custom panning.
- Select focus fallbacks outside an item before removing that item from the DOM.
- Retry `captureElementImage()` only for a verified missing-paint-record error;
  surface permanent API, ancestry, and drawable-state failures.

## Validation and review

- Add or update tests for changed behavior and run the relevant focused tests
  while developing.
- Before opening a pull request, run the checks listed in `CONTRIBUTING.md`.
- Review the final diff through these instructions and the applicable Modern Web
  Guidance recommendations.
