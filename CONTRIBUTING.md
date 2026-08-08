# Contributing to Replofy OS

Thank you for improving Replofy OS. Contributions should leave the project
safer, easier to operate, and no more dependent on private Replofy services.

## Development setup

1. Install Node.js 22 or newer. Add Java 21 or newer only when using the
   Firebase emulator workflow.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` for the standalone server (`.env.local` is
   only a Vite-only compatibility option).
4. Run `npm run preflight`.
5. For the primary standalone path, start PostgreSQL and run
   `npm run dev:standalone`. Use `npm run dev:all` only for the Firebase
   compatibility workflow.

The standalone path uses local PostgreSQL, local authentication, and
filesystem assets by default. Firebase emulators remain available for the
compatibility adapter. Never point tests at a production Firebase project.

The optional Python MCP smoke suite requires Python 3.11 or newer and
`python -m pip install -r mcp/requirements.txt`.

## Before opening a pull request

Run the checks relevant to your change:

```text
npm run check
npm run lint
npm run build:firebase
npm run build:standalone
npm run server:build
npm run check:public-safety
npm run check:licenses
npm run check:dependencies
npm run test:context-routing
npm run test:platform-contracts
npm run test:mcp:hosted
npm run test:smoke:mcp
npm run check:public-surface
npm run export:public-root -- --out D:/path/to/a-new-public-root
```

Include tests for changed behavior, update public documentation and API
descriptions, and keep pull requests focused. Do not commit credentials,
production data, generated emulator exports, or private customer information.

## Changes to data and public interfaces

Database changes require a versioned migration once the PostgreSQL substrate is
introduced. Changes to `/api/v1`, MCP tools, OAuth behavior, or stored records
must document compatibility impact and add contract coverage.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
