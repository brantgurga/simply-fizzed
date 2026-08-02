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

## Linting

Linting is handled by [oxlint](https://oxc.rs/docs/guide/usage/linter), a fast
Rust-based linter. It is the linter of record for this project; ESLint is
intentionally not used.

Configuration lives in [`.oxlintrc.json`](./.oxlintrc.json):

- Rule **categories** are enabled broadly: `correctness` as errors, with
  `suspicious` and `perf` as warnings. The `style` category is left off because
  formatting is delegated to Prettier (tracked separately).
- Plugins cover the stack: `eslint`, `typescript`, `unicorn`, `oxc`, `react`,
  `jsx-a11y`, and `import`.
- **Type-aware linting** is enabled via `options.typeAware` (backed by the
  `oxlint-tsgolint` dependency), turning on rules such as
  `typescript/no-floating-promises` and `typescript/no-misused-promises`.

Run `npm run lint` for the standard check or `npm run lint:fix` to apply safe
automatic fixes.

## Project structure

```
.
├── public/           # Static assets served as-is
├── src/              # Application source
│   ├── assets/       # Imported assets
│   ├── App.tsx       # Root component
│   └── main.tsx      # Application entry point
├── index.html        # HTML entry point
└── vite.config.ts    # Vite configuration
```
