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
- `npm run lint` – run the linter

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
