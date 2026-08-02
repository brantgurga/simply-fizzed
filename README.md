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
- `npm test` – run the test suite once with Vitest
- `npm run test:watch` – run Vitest in watch mode

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

Tests live next to the code they cover as `*.test.tsx` / `*.test.ts` files.

Run `npm test` for a single run (used in CI) or `npm run test:watch` while
developing.

## Project structure

```
.
├── public/           # Static assets served as-is
├── src/              # Application source
│   ├── assets/       # Imported assets
│   ├── test/         # Test setup (Vitest)
│   ├── App.tsx       # Root component
│   ├── App.test.tsx  # Tests for the root component
│   └── main.tsx      # Application entry point
├── index.html        # HTML entry point
└── vite.config.ts    # Vite + Vitest configuration
```
