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
  [`firestore.rules`](./firestore.rules) and indexes in
  [`firestore.indexes.json`](./firestore.indexes.json). See
  [Data model](#firestore-data-model) below.
- **Authentication** (port 9099).
- **Emulator UI** (port 4000).

Start the full suite with `npm run emulators`, or just the Hosting emulator with
`npm run emulators:hosting`. The Firestore and Authentication emulators require a
Java runtime on your `PATH`; the Hosting emulator does not.

### Caching headers

[`firebase.json`](./firebase.json) sets `Cache-Control` headers so the entry HTML
is always revalidated while the content-hashed build assets are cached
aggressively. A broad `**` rule applies `no-cache` to every response, and a
`/assets/**` rule then overrides those files with
`public, max-age=31536000, immutable`. Firebase Hosting applies the last matching
rule, so hashed assets stay immutable while `/`, SPA routes, and `index.html`
remain uncached. These headers only take effect on a real deploy (served via the
production CDN); the Hosting emulator does not apply the `headers` block, so use a
deploy or preview channel to verify them.

### Project aliases and deploy configuration

Project aliases live in [`.firebaserc`](./.firebaserc). Both `default` and
`local` point at the emulator-only `demo-simply-fizzed` id so local development
and tests never touch a real project. A real project id and a `prod` alias for
deployment are added alongside the hosting deploy/CD work tracked in #24.

The Firebase client SDK is initialized in
[`src/firebase.ts`](./src/firebase.ts), which reads the web app configuration
from `VITE_FIREBASE_*` environment variables (via `import.meta.env`) rather than
hardcoding it, and exports a shared `Firestore` instance (`db`). When the
configured `projectId` starts with `demo-`, it automatically calls
`connectFirestoreEmulator(db, "127.0.0.1", 8080)`, so local development and the
e2e tests talk to the emulator while production builds use real Firebase with no
manual flag. See [Environment variables](#environment-variables) for how the
configuration is supplied.

### Environment variables

Configuration is provided through Vite environment variables (only
`VITE_`-prefixed variables are exposed to the client), and their types are
declared in [`src/vite-env.d.ts`](./src/vite-env.d.ts):

- [`.env`](./.env) is **committed** and holds **demo-only, non-secret** values
  (project `demo-simply-fizzed`, a placeholder Maps key). It points the app at
  the Firebase Emulator Suite, so local development and e2e need no setup.
- [`.env.example`](./.env.example) documents every required variable.
- For production, real values (including the real `VITE_GOOGLE_MAPS_API_KEY`) go
  in a gitignored `.env.*.local` file or are supplied via CI — Vite loads
  `.env.production.local` ahead of `.env`. `.env.local` and `.env.*.local` are
  gitignored so secrets are never committed.

### Firestore data model

Location-based soda discovery is backed by three collections, whose document
shapes are defined as TypeScript types in
[`src/model/firestore.ts`](./src/model/firestore.ts) and shared by the app, the
emulator seed script, and tests:

- **`locations/{locationId}`** – a place that sells soda: `name`, an `address`
  (`street`, `city`, `state`, `postalCode`), a `geo` coordinate (`lat`, `lng`),
  and a `geohash` derived from `geo` with
  [`geofire-common`](https://www.npmjs.com/package/geofire-common) for radius
  queries.
- **`sodas/{sodaId}`** – a soda product: `name`, `brand`, `flavor`.
- **`availability/{availabilityId}`** – a join record tying a soda to a location
  in a given `form` (`draft`, `can`, or `bottle`), with the soda's display fields
  (`sodaName`, `sodaBrand`, `sodaFlavor`) denormalized so search results render
  without an extra lookup.

Security rules in [`firestore.rules`](./firestore.rules) allow public `read` on
all three collections and deny all client `write`s (data is populated out of
band); every other path falls through to the default-deny rule.

[`firestore.indexes.json`](./firestore.indexes.json) is intentionally empty: the
only non-trivial query is the geohash radius search, which uses a single-field
`orderBy(geohash)` range and therefore needs no composite index. Firestore
provides single-field indexes automatically, so no `fieldOverrides` are required
either.

## Project structure

```
.
├── e2e/                     # Playwright end-to-end tests
├── public/                  # Static assets served as-is
├── src/                     # Application source
│   ├── assets/              # Imported assets
│   ├── model/               # Shared Firestore data-model types
│   ├── test/                # Test setup (Vitest)
│   ├── App.tsx              # Root component
│   ├── App.test.tsx         # Tests for the root component
│   ├── firebase.ts          # Firebase client init + Firestore emulator wiring
│   ├── vite-env.d.ts        # Types for VITE_* environment variables
│   └── main.tsx             # Application entry point
├── .env                     # Committed demo-only config (no secrets)
├── .env.example             # Documents all required environment variables
├── firebase.json            # Firebase hosting + emulator configuration
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
├── index.html               # HTML entry point
├── playwright.config.ts     # Playwright configuration
└── vite.config.ts           # Vite + Vitest configuration
```
