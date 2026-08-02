# simply-fizzed

Simply Fizzed is a tracker for places to find soda and to review and discover new soda possibilities.

## Tech stack

This repository is being bootstrapped with the professional stack tracked in issue #6:

- **React** + **TypeScript** for the UI
- **Vite** for the dev server and production build

Additional tooling (linting, formatting, testing, Firebase, and CI/CD) is tracked as sub-issues of #6.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (developed against v24)
- npm 10 or newer
- A Java runtime (JDK 11 or newer) for the Firebase Emulator Suite. The Hosting
  emulator used by the end-to-end tests does not require Java, but the Firestore
  and Authentication emulators do.

## Getting started

Install dependencies:

```sh
npm install
```

Start the development server with hot module replacement:

```sh
npm run dev
```

## Available scripts

- `npm run dev` – start the Vite dev server
- `npm run build` – type-check and build for production (output in `dist/`)
- `npm run preview` – preview the production build locally
- `npm run typecheck` – type-check without emitting output
- `npm run lint` – lint the codebase with oxlint
- `npm run lint:fix` – lint and apply safe automatic fixes
- `npm run lint:types` – lint including type-aware rules
- `npm run fmt` – format the codebase with oxfmt
- `npm run fmt:check` – check formatting without writing changes
- `npm test` – run the unit test suite once with Vitest
- `npm run test:watch` – run Vitest in watch mode
- `npm run e2e` – run the end-to-end tests with Playwright
- `npm run e2e:ui` – run Playwright in interactive UI mode
- `npm run emulators` – start the full Firebase Emulator Suite
- `npm run emulators:hosting` – start only the Firebase Hosting emulator

## Linting

Linting is handled by [oxlint](https://oxc.rs/docs/guide/usage/linter), a fast
Rust-based linter. It is the linter of record for this project; ESLint is
intentionally not used.

Configuration lives in [`.oxlintrc.json`](./.oxlintrc.json):

- Rule **categories** are enabled broadly: `correctness` as errors, with
  `suspicious` and `perf` as warnings. The `style` category is left off because
  formatting is delegated to oxfmt (see below).
- Plugins cover the stack: `eslint`, `typescript`, `unicorn`, `oxc`, `react`,
  `jsx-a11y`, and `import`.
- **Type-aware linting** is enabled via `options.typeAware` (backed by the
  `oxlint-tsgolint` dependency), turning on rules such as
  `typescript/no-floating-promises` and `typescript/no-misused-promises`.

Run `npm run lint` for the standard check or `npm run lint:fix` to apply safe
automatic fixes.

## Formatting

Formatting is handled by [oxfmt](https://oxc.rs/docs/guide/usage/formatter), the
Rust-based formatter from the same Oxc toolchain as oxlint. It is used instead of
a standalone Prettier install: oxfmt is Prettier-compatible (it passes Prettier's
JS/TS conformance tests) while keeping the toolchain consistent with the linter.

Configuration lives in [`.oxfmtrc.json`](./.oxfmtrc.json). It uses oxfmt's
Prettier-compatible defaults and reads shared settings (indentation, line
endings, final newline) from [`.editorconfig`](./.editorconfig). Formatting and
linting do not overlap: oxlint's `style` category is left off, leaving all
stylistic concerns to oxfmt.

Run `npm run fmt` to format the codebase, or `npm run fmt:check` to verify
formatting without writing changes.

## Testing

Tests run on [Vitest](https://vitest.dev/) with
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
Vitest reuses [`vite.config.ts`](./vite.config.ts), so tests share the same
plugins and resolution as the app. The `test` block there enables `globals`, the
`jsdom` environment for a browser-like DOM, and a setup file
([`src/test/setup.ts`](./src/test/setup.ts)) that registers
[`@testing-library/jest-dom`](https://github.com/testing-library/jest-dom)
matchers and cleans up the DOM after each test.

Unit and component tests live next to the code they cover as `*.test.tsx` /
`*.test.ts` files.

Run `npm test` for a single run (used in CI) or `npm run test:watch` while
developing.

## End-to-end testing

End-to-end tests run on [Playwright](https://playwright.dev/) against the
production build **served by the Firebase Hosting emulator**. The config
([`playwright.config.ts`](./playwright.config.ts)) starts a `webServer` that runs
`npm run build && npm run emulators:hosting`, then exercises the app in
**Chromium, Firefox, and WebKit** on `http://127.0.0.1:5000`. Running against the
Hosting emulator (rather than the raw Vite preview) means the tests exercise the
same hosting behavior — SPA rewrites and headers — as production. E2E specs live
in [`e2e/`](./e2e) as `*.spec.ts` files; Vitest is configured to ignore that
directory so the two runners never overlap.

Browser binaries are installed hermetically (`PLAYWRIGHT_BROWSERS_PATH=0`), so
they live under `node_modules/` rather than a global OS cache. This keeps them on
the same drive as the repository and makes the install self-contained. Download
the browsers once with:

```sh
npx playwright install
```

Then run the suite with `npm run e2e`, or `npm run e2e:ui` for the interactive
runner.

## Firebase Emulator Suite

Local development and testing use the
[Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite) via
[`firebase-tools`](https://www.npmjs.com/package/firebase-tools) (a dev
dependency, so no global install is required). Configuration lives in
[`firebase.json`](./firebase.json); the emulated project id is
`demo-simply-fizzed`, whose `demo-` prefix keeps the emulators fully offline and
avoids any calls to production Firebase.

The suite is configured for:

- **Hosting** (port 5000) – serves the production build from `dist/` with SPA
  rewrites; this is what the end-to-end tests run against.
- **Firestore** (port 8080) – with security rules in
  [`firestore.rules`](./firestore.rules) (default-deny until data models are
  added) and indexes in [`firestore.indexes.json`](./firestore.indexes.json).
- **Authentication** (port 9099).
- **Emulator UI** (port 4000).

Start the full suite with `npm run emulators`, or just the Hosting emulator with
`npm run emulators:hosting`. The Firestore and Authentication emulators require a
Java runtime on your `PATH`; the Hosting emulator does not.

## Project structure

```
.
├── e2e/                     # Playwright end-to-end tests
├── public/                  # Static assets served as-is
├── src/                     # Application source
│   ├── assets/              # Imported assets
│   ├── test/                # Test setup (Vitest)
│   ├── App.tsx              # Root component
│   ├── App.test.tsx         # Tests for the root component
│   └── main.tsx             # Application entry point
├── firebase.json            # Firebase hosting + emulator configuration
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
├── index.html               # HTML entry point
├── playwright.config.ts     # Playwright configuration
└── vite.config.ts           # Vite + Vitest configuration
```
