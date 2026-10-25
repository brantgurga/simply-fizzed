# Web change guidance

Apply this guidance only to HTML, CSS, and client-side JavaScript work.

## Modern Web Guidance

- Consult the installed `modern-web-guidance` skill before implementation.
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

## Known caveats

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
