# simply-fizzed

Simply Fizzed is a tracker for places to find soda and to review and discover new soda possibilities.

## Tech stack

This repository is being bootstrapped with the professional stack tracked in issue #6:

- **React** + **TypeScript** for the UI
- **Material UI** (MUI) for the component library and theming
- **Vite** for the dev server and production build

Additional tooling (linting, formatting, testing, Firebase, and CI/CD) is tracked as sub-issues of #6.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer (developed against v24)
- npm 10 or newer
- A Java 21 runtime for the Firestore emulator. Authentication and Hosting do
  not require Java, but the end-to-end suite starts Firestore too.

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
- `npm run emulators:e2e` – start the Hosting, Firestore, and Authentication
  emulators (used by the end-to-end tests)

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
production build **served by the Firebase Hosting emulator**, with seeded
**Firestore** and isolated **Authentication** emulators backing the app. The config
([`playwright.config.ts`](./playwright.config.ts)) starts a `webServer` that runs
`npm run build && npm run emulators:e2e` (Hosting, Firestore, and Authentication), then
exercises the app in **Chromium, Firefox, and WebKit** on
`http://127.0.0.1:5000`. Running against the Hosting emulator (rather than the
raw Vite preview) means the tests exercise the same hosting behavior — SPA
rewrites and headers — as production. E2E specs live in [`e2e/`](./e2e) as
`*.spec.ts` files; Vitest is configured to ignore that directory so the two
runners never overlap.

Before any test runs, Playwright's
[`globalSetup`](./e2e/global-setup.ts) waits for the Firestore emulator, clears
it, and seeds deterministic fixtures ([`e2e/fixtures.ts`](./e2e/fixtures.ts))
with [`firebase-admin`](https://www.npmjs.com/package/firebase-admin): a Kroger
in Indianapolis with canned sodas and a Tim's Brewery with root beer on draft.
The seeded-search spec grants a fixed Indianapolis geolocation via the Playwright
browser context (Chromium only, where the override is dependable) and asserts
that results are sorted nearest-first and each location lists its sodas and
forms. The fixtures module is shared by the seeder and the specs so the data and
expectations cannot drift.

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
  [Data model](#firestore-data-model) below. The end-to-end tests seed and query
  this emulator.
- **Authentication** (port 9099).
- **Emulator UI** (port 4000).

Start the full suite with `npm run emulators`, just the Hosting emulator with
`npm run emulators:hosting`, or the Hosting + Firestore + Authentication group
the end-to-end tests use with `npm run emulators:e2e`. Firestore requires Java
21 on your `PATH`; Authentication and Hosting do not.

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

### Offline support and installation

The production build is installable as a Progressive Web App. `vite-plugin-pwa`
generates a Workbox service worker that pre-caches the versioned app shell and
assets, while Firestore stores completed queries in IndexedDB across tabs. The
last resolved search center is retained
locally, so cached manual searches can reload without network geocoding. Firestore
queues future client writes for synchronization after the connection returns.
Service-worker registration is disabled during development to avoid stale HMR
assets.

### Project aliases and deploy configuration

Project aliases live in [`.firebaserc`](./.firebaserc). Both `default` and
`local` point at the emulator-only `demo-simply-fizzed` id so local development
and tests never touch a real project. Only the `prod` alias points at the hosted
`simply-fizzed-prod` project, and deployment jobs also specify that project id
explicitly.

The Firebase client SDK is initialized in
[`src/firebase.ts`](./src/firebase.ts), which reads the web app configuration
from `VITE_FIREBASE_*` environment variables and exports shared Auth and
Firestore instances. A `demo-` project automatically connects both services to
the local emulators; other project ids use real Firebase with no manual flag.
See [Environment variables](#environment-variables) for configuration details.

### Optional authentication

Every current feature remains public. The app bar offers an optional FirebaseUI
email/password sign-in and account-creation screen, shows the active user, and
allows sign-out. Auth uses browser-local persistence so an established session
is restored when the installed app starts offline.

Authentication in local development and e2e uses only the local emulator. Social
identity providers are intentionally deferred because they require provider credentials
and authorized domains from a live Firebase project.

### Environment variables

Configuration is provided through Vite environment variables (only
`VITE_`-prefixed variables are exposed to the client), and their types are
declared in [`src/vite-env.d.ts`](./src/vite-env.d.ts):

- [`.env`](./.env) is **committed** and holds **demo-only, non-secret** values
  (project `demo-simply-fizzed`, a placeholder Maps key). It points the app at
  the Firebase Emulator Suite, so local development and e2e need no setup.
- [`.env.example`](./.env.example) documents every required variable.
- For production, real values go in a gitignored `.env.*.local` file or are
  supplied via CI — Vite loads `.env.production.local` ahead of `.env`.
  Firebase and Maps browser keys are visible in the delivered JavaScript and
  should use provider-side API/application restrictions.

### Firebase Hosting delivery

After CI passes on `main`, [the delivery workflow](./.github/workflows/firebase-hosting.yml)
builds with the production Firebase configuration and deploys the exact artifact
to the fixed `staging` preview channel. Redeploying refreshes the channel's 30-day
expiration while preserving its URL. Tests remain on the committed demo
configuration and explicit `demo-simply-fizzed` emulator project.

After the first fixed-channel deploy, copy the staging URL from the workflow
summary and add its origin to the `VITE_GOOGLE_MAPS_API_KEY` HTTP referrer
allowlist alongside the production origin. The staging and production artifacts
use the same browser key, and the staging URL remains stable across subsequent
deploys to this channel.

Review the staging URL in the workflow summary, then manually run **Firebase
Hosting CD** with the latest successful staging run's ID to approve and promote
the same artifact to the live channel. The workflow rejects superseded runs and
serializes staging deploys with promotions so the reviewed URL cannot change
while approval is underway. Promotion remains a separate manual action so an
unreviewed staging build cannot publish automatically.

The workflow exchanges GitHub OIDC tokens for short-lived Google credentials
through `google-github-actions/auth`; it stores no service-account key. Build
scripts run in a separate job without OIDC access. Configure repository variables
`VITE_FIREBASE_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, and
`GCP_WORKLOAD_IDENTITY_PROVIDER` (the provider's full resource name).

The dedicated `github-deployer@simply-fizzed-prod.iam.gserviceaccount.com`
service account needs Firebase Hosting Admin; add Firebase Authentication Admin
if staging URLs should support sign-in. Restrict the provider to repository ID
`1320193089`, `refs/heads/main`, and this workflow, then grant only that identity
`roles/iam.workloadIdentityUser`.

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

## User interface

Material UI (MUI) provides the component library and theming. The app is wrapped
in MUI's `ThemeProvider` with a shared theme from
[`src/theme.ts`](./src/theme.ts) (created via `createTheme` with `cssVariables`
enabled) and a `CssBaseline` (`enableColorScheme`) that applies MUI's baseline
styles and native light/dark handling. The Roboto font — MUI's default typeface —
is self-hosted via
[`@fontsource/roboto`](https://www.npmjs.com/package/@fontsource/roboto) and
imported in [`src/main.tsx`](./src/main.tsx), so no external font request is
made. Components are imported per module (e.g. `@mui/material/AppBar`) to keep
bundles tree-shakeable.

### Location input

The [`LocationInput`](./src/location/LocationInput.tsx) component lets the user
provide a search location. On mount it requests browser geolocation and, when
permission is granted, resolves immediately with those coordinates. When
geolocation is denied or unavailable it falls back to manual city / postal-code
entry, and denied permission and geocoding failures surface as clear messages.

Manual entries are turned into coordinates through a small `Geocoder` interface
in [`src/location/geocoder.ts`](./src/location/geocoder.ts), so the
implementation can be swapped by environment. `GoogleMapsGeocoder` loads the
browser-supported Maps JavaScript API geocoder with `VITE_GOOGLE_MAPS_API_KEY`,
while `FakeGeocoder` is an offline stub used for local development and tests (no live
API calls, no billing). `createGeocoder()` picks between them using the same
`demo-` key convention as `src/firebase.ts`: a `demo-` prefixed key selects the
fake, and any other key selects Google. Browser geolocation already returns
coordinates, so geocoding is only needed for the manual fallback.

### Nearby search

Once a location is set, the [`NearbySearch`](./src/nearby/NearbySearch.tsx)
container queries for soda within 60 miles and renders the results (name,
address, distance in miles, and each soda with its form, e.g. "Big K Root Beer
in cans" or "Tim's Root Beer on draft") via the presentational
[`SearchResults`](./src/nearby/SearchResults.tsx) component, handling loading,
empty, and error states.

The query lives in [`src/nearby/nearby.ts`](./src/nearby/nearby.ts): it computes
`geohashQueryBounds` for the radius with
[`geofire-common`](https://www.npmjs.com/package/geofire-common), runs the
overlapping `orderBy(geohash)` range queries against `locations`, then
batch-loads `availability` for the in-radius locations with chunked
`where("locationId", "in", ...)` queries. The distance calculation, the 60-mile
filter, and nearest-first sorting are kept as pure, unit-tested functions in
[`src/nearby/distance.ts`](./src/nearby/distance.ts), and document
parsing/formatting in [`src/nearby/results.ts`](./src/nearby/results.ts), both
free of React and Firestore so they can be tested without a database.

## Project structure

```text
.
├── e2e/                     # Playwright end-to-end tests
│   ├── app.spec.ts          # E2E specs (app shell + seeded search scenario)
│   ├── fixtures.ts          # Deterministic seed data shared by setup + specs
│   └── global-setup.ts      # Seeds the Firestore emulator before tests
├── public/                  # PWA icons and static assets
├── src/                     # Application source
│   ├── location/            # Location input, geocoding, and saved search center
│   ├── nearby/              # Nearby search: distance logic, query, results UI
│   ├── model/               # Shared Firestore data-model types
│   ├── test/                # Test setup (Vitest)
│   ├── App.tsx              # Root component (app shell)
│   ├── App.test.tsx         # Tests for the root component
│   ├── firebase.ts          # Firebase init, persistence, and emulator wiring
│   ├── theme.ts             # Material UI theme
│   ├── vite-env.d.ts        # Types for VITE_* environment variables
│   └── main.tsx             # Application entry point
├── .env                     # Committed demo-only config (no secrets)
├── .env.example             # Documents all required environment variables
├── firebase.json            # Firebase hosting + emulator configuration
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
├── index.html               # HTML entry point
├── playwright.config.ts     # Playwright configuration
└── vite.config.ts           # Vite, Vitest, and PWA configuration
```
