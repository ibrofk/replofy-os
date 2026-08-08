# Option C completion matrix

This is the handoff ledger for the PostgreSQL self-hosted edition. “Local”
means it has passed in the current checkout. “CI” means the repository has a
workflow for it; Docker and PostgreSQL service-backed proofs still require the
CI environment, while the MCP dependency suite can also run locally after
installing `mcp/requirements.txt`. “Human” means the repository can inventory
the item but cannot prove ownership or legal approval by itself.

| Option C promise | Evidence | Current status | Release action |
| --- | --- | --- | --- |
| Standalone server and local auth | `src/server/`, Better Auth, PostgreSQL migrations, bootstrap endpoint, `test:server:http` routing smoke, `test:server:http:integration`, `test:server:recovery`, and `test:server:database-reconnect` | Local route smoke; PostgreSQL-backed HTTP auth/bootstrap, API-key, isolation, API-server stop/start persistence, forced API-process crash/restart, PostgreSQL container restart persistence, and a fresh API process serving the preserved authenticated task are configured in CI | Retain the recovery logs; a host-machine reboot and provider-level database failover remain outside this repository's proof. |
| Native one-command development | `npm run dev:standalone` applies migrations and starts API + standalone Vite proxy; Windows launcher syntax plus dependency/build/routing checks are configured in CI | Launcher local; Windows dependency/build/routing gate configured; PostgreSQL runtime required | Run it from a clean clone with a reachable PostgreSQL service. |
| Workspace isolation and membership | Workspace-scoped queries, memberships, invitations, API-key scopes | Local tests; integration workflow | Run the PostgreSQL integration job from a clean checkout. |
| Provider-neutral assets | `AssetStore`, filesystem and S3-compatible drivers, MinIO profile | Local unit/contract tests; direct `S3AssetStore` upload/download/delete plus backup-object checks are configured in the MinIO workflow | Retain the direct adapter and backup/restore logs and review bucket policy. |
| Backup, restore, export | `backup:standalone`, `restore:standalone`, `export:standalone`, secret filtering | Local script/client tests; PostgreSQL workflow | Complete a populated database + assets restore drill. |
| Upgrade and rollback | Versioned Drizzle migrations and CI prior-release rehearsal | CI | Pass the prior-revision job and retain its logs with the release artifact. |
| Browser/API product surfaces | Standalone routes/pages for execution, content, chat, operators, creative, growth, technical, systems, plans, and team; HTTP routing and PostgreSQL CRUD/restart suites | Local build/client and routing smoke; PostgreSQL CRUD/restart proof is configured in CI | Add or preserve representative CRUD smoke coverage as surfaces change. |
| Platform seams | `WorkspaceRepository`, `AuthProvider`, `AIProvider`, `AssetStore`, and `WorkspaceEventBus` are explicit; standalone data services now depend on the repository capability interface | AssetStore shared contract runs against filesystem and mocked S3 adapters; AI/event/client seams have local fixtures; persistence/auth cross-adapter fixtures remain pending | Add contract fixtures for alternate persistence/auth providers and retain the same service tests across adapters. |
| Optional AI/provider paths | Bounded local context extraction; injected `AIProvider` seam; Gemini and Cloudinary remain optional | `test:platform-contracts` proves injected extraction and Gemini's no-key local fallback; the application CI job runs this suite; live provider billing/terms remain external | Retain the no-key test log and document provider terms before enabling hosted providers. |
| MCP support | `mcp/replofy_os_mcp_server.py` plus hosted compatibility path | Local hosted protocol smoke, Python syntax, in-process FastMCP dispatch, and subprocess HTTP plus stdio transports against a stub API; CI runs the same installed-dependency suite; live hosted API parity and hosted/standalone parity remain external | Run with `mcp/requirements.txt`; do not claim live-host parity until an authenticated deployed endpoint is exercised against both documented transports. |
| Public project surface | Apache-2.0 license, contribution/security/support/governance docs, changelog, release policy, `check:public-surface`, and clean-root CI export | Local structure/export proof; CI step configured | Complete provenance and legal review before publishing artifacts. |
| Dependency and license gates | `check:dependencies`, `check:licenses`, `docs/third-party-license-overrides.json`, documented React Router RSC exception | Local lockfile license scan works with or without `node_modules`; the full build/test gate still requires installed dependencies | Reassess the exception and explicit license evidence when routing or dependencies change. |
| Repository history safety | `check:public-safety:history`, `export:public-root`, and the CI clean-root initial-history rehearsal | Current source history remains red; the exporter and application CI prove a new clean-root commit has no reported historical findings | Rotate affected credentials and scrub history, or publish the reviewed clean root while retaining the clean-history scan log. |
| Asset, trademark, and privacy provenance | `docs/ASSET-PROVENANCE.md`, `TRADEMARKS.md`, `PRIVACY.md` | Human review required | Obtain ownership/permission and deployment-specific privacy sign-off. |

## Current verification command set

The local, dependency-only gate is:

```bash
npm run check
npm run check:public-surface
npm run server:build
npm run build:firebase
npm run build:standalone -- --manifest --outDir .tmp/standalone-verify
node scripts/check-standalone-bundle.mjs .tmp/standalone-verify
npm run test:standalone-client
npm run test:asset-store
npm run test:s3-asset-store
npm run test:asset-store-contracts
npm run test:event-bus
npm run test:platform-contracts
npm run test:server:http
npm run test:server:config
npm run test:postgres-cli
npm run test:s3-client
npm run test:mcp:hosted
```

The installed-dependency standalone MCP test runs in the MCP CI job and can be
run locally after installing the requirements:

```bash
python -m pip install --requirement mcp/requirements.txt
python -m unittest discover -s mcp/tests -p "test_*.py"
```

The PostgreSQL-backed HTTP proof runs in the service-backed CI job:

```bash
npm run test:server:http:integration
npm run test:server:recovery
npm run test:server:database-reconnect
```

The same PostgreSQL job restarts its service container after the HTTP proof,
compares representative row counts before and after it comes back, and starts a
fresh API process to read the preserved authenticated task. This is a
database-container restart and application-reconnect rehearsal, not host
failover or provider disaster recovery.

The direct S3AssetStore proof runs in the MinIO-backed CI job:

```bash
npm run test:s3-asset-store:integration
```

The pre-publication gate is intentionally separate:

```bash
npm run check:public-safety:history
```

Do not rewrite published Git history from a working tree without an agreed
release procedure. A clean public mirror is the safer fallback when reachable
history cannot be scrubbed in place.
