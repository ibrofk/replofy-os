# Self-hosting Replofy OS

Replofy OS is a PostgreSQL self-hosted developer preview: the standalone
server, local email/password authentication, workspace isolation,
invitation-based membership, versioned migrations, filesystem/S3-compatible
asset storage, strategy records, operator runtime, and standalone product
surfaces use the local server. The Firebase adapter remains available for the
hosted compatibility build.

The standalone application services are wired through explicit
`WorkspaceRepository`, `AuthProvider`, `AIProvider`, `AssetStore`, and
`WorkspaceEventBus` boundaries. PostgreSQL and Better Auth are the default
adapters; Gemini is optional with a local extraction fallback; filesystem
assets are the zero-dependency default.

## Keep persistent data on D: (Windows)

Docker does not need to be installed while working on the native Node path.
Before eventually starting Compose, create an untracked `.env` file:

```dotenv
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
REPLOFY_BOOTSTRAP_TOKEN=replace-with-at-least-32-random-characters
POSTGRES_PASSWORD=replace-with-a-strong-database-password
REPLOFY_POSTGRES_DATA=D:/ReplofyData/postgres
REPLOFY_APP_DATA=D:/ReplofyData/assets
REPLOFY_SECURE_COOKIES=false
REPLOFY_INVITATION_TTL_HOURS=168
```

Those bind mounts keep database and uploaded asset data on D:. Docker engine
images and build cache use Docker Desktop's configured disk location, which
must also be moved to D: before installing or building if C: remains tight.
The 10--15 GB figure is a Docker Desktop planning budget, not a Replofy OS
runtime requirement. The native Node path needs the checkout, Node
dependencies, a PostgreSQL service, and the data you create; it does not need
Docker images or a Docker VM. If both local volumes are nearly full, defer
Compose installation and use CI or another machine for the service-backed
checks.
Set `REPLOFY_SECURE_COOKIES=true` when the public
`REPLOFY_SERVER_URL` uses HTTPS. The default local HTTP stack leaves it false
so Better Auth can establish a session on `localhost`.

Owners and admins can create time-limited invitation links from the Team
screen. Only owners can grant the admin role. The server stores a SHA-256
digest rather than the clear invitation token, and each link can be accepted
once. Set `REPLOFY_SERVER_URL` to the externally reachable HTTPS origin before
creating invitations in production so generated links use the correct host.

## Native development without Docker

Install PostgreSQL through an existing system or managed service, set the
standalone values in `.env`, and run:

```bash
npm run dev:standalone
```

The command applies migrations, starts the standalone API on port 4100, and
starts the standalone Vite proxy on port 4000. It does not install or start a
database for you; a failed migration is the signal to fix `DATABASE_URL` or
start PostgreSQL. This path avoids Docker images, the Docker VM, and their
disk budget.

## Connect the standalone MCP

From the Team screen, create an API key and copy it immediately. Replofy stores
only its SHA-256 digest. The generated key is scoped to the active workspace
and is automatically invalid if its owner loses that workspace membership.

```powershell
$env:REPLOFY_OS_BASE_URL = "http://localhost:4100"
$env:REPLOFY_OS_API_KEY = "rpo_local_replace_with_the_copied_key"
python mcp/replofy_os_mcp_server.py
```

API keys can be revoked from the Team screen. Standalone currently exposes
tasks, cycle goals, visions, members, workspace events, and Team Chat
channels, identities, membership, and immutable messages. Structured blog
articles--including briefs, evidence, distribution metadata, and publication
workflow--are also stored in PostgreSQL. Strategy records (prompts, social posts,
SEO keywords, feedback, time blocks, and week markers) use workspace-scoped
PostgreSQL tables as well. The Firebase adapter remains available only for the
hosted compatibility build; standalone routes do not depend on it.

Creative Hub items and asset metadata are PostgreSQL-backed. Authenticated
binary uploads and downloads use the configured workspace-isolated AssetStore
(filesystem by default, S3-compatible when enabled); Creative API keys require
`creative:read` or `creative:write`.

Growth Pipeline accounts and leads are PostgreSQL-backed, including account
linkage, task references, owners, pipeline stages, priorities, and follow-up
dates. API keys require `growth:read` or `growth:write`.

Technical Studio bugs and roadmap items are PostgreSQL-backed, including
validated task links and structured repository/directory references. API keys
require `technical:read` or `technical:write`.

## Provider-neutral asset storage

Filesystem storage is the zero-dependency default. The standalone server also
supports an S3-compatible endpoint such as MinIO without Cloudinary:

```dotenv
REPLOFY_ASSET_STORE=s3
REPLOFY_S3_ENDPOINT=http://minio:9000
REPLOFY_S3_BUCKET=replofy-assets
REPLOFY_S3_ACCESS_KEY_ID=replofy-local
REPLOFY_S3_SECRET_ACCESS_KEY=replace-with-a-long-secret
REPLOFY_S3_REGION=us-east-1
REPLOFY_S3_FORCE_PATH_STYLE=true
REPLOFY_S3_CREATE_BUCKET=true
```

The Compose MinIO service is opt-in so a filesystem-only installation does not
download another storage image:

```bash
docker compose --profile s3 up --build
```

For native development, use `http://127.0.0.1:9000` as the endpoint. Keep S3
credentials out of committed files. The standalone backup bundle captures
filesystem assets and, when `REPLOFY_ASSET_STORE=s3`, exports S3 objects into
the bundle as well. S3 restore upserts bundled objects but does not delete
unrelated keys, so use a dedicated bucket per Replofy instance.

Systems is PostgreSQL-backed as well. Environment records are workspace-scoped,
deploy and rollback actions append immutable history rows, and API endpoint
inventory has unique method/path protection. API keys require `systems:read` or
`systems:write`; deployment actions record state transitions but intentionally do
not pretend to run an external build provider.

Business Plans are stored as revisioned Markdown with structured links and
editing presence under the `business_plan*` tables. Context ingestion stores
source metadata, immutable versions, extracted payloads, and a review queue in
PostgreSQL. Gemini remains optional: without `GEMINI_API_KEY`, the server uses
bounded local extraction and still keeps the source/version audit trail.

Operator Desks and work orders are PostgreSQL-backed as well. Desks define
output allowlists, approval modes, routing rules, connected agents, and
dangerous-action constraints. Work-order claims are transactional and
workspace-scoped; only the claiming external agent can release its claim.
Operator context packs, check-ins, scoped memory, output submission,
injections, and approval decisions are also durable. Approved writes are
transactional for the migrated Tasks, Blog Articles, Team Chat, and Operator
Memory destinations. Unsupported destinations remain visible as routing
warnings and cannot be approved into a partial write.

The standalone operator model is the canonical replacement for the hosted
Firebase `agenticTasks` and `osOperators` collections. Those legacy records are
not imported by standalone bootstrap; migrate the durable intent into Operator
Desks and work orders explicitly.

## Start the preview stack

```bash
docker compose config
docker compose up --build
```

The app waits for PostgreSQL, applies versioned migrations, and listens on
`http://localhost:4100`. Check:

```bash
curl http://localhost:4100/health/ready
```

Bootstrap exactly one owner and workspace:

```bash
curl -X POST http://localhost:4100/api/setup/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "token": "the-value-of-REPLOFY_BOOTSTRAP_TOKEN",
    "name": "Owner",
    "email": "owner@example.com",
    "password": "choose-a-long-password",
    "workspaceName": "My Workspace",
    "workspaceSlug": "my-workspace"
  }'
```

After bootstrap, optional deterministic demo records can be added to the first
workspace (or `REPLOFY_SEED_WORKSPACE_ID`):

```bash
npm run seed:standalone
```

The seed is idempotent and contains no credentials or provider tokens.

## Data ownership

- PostgreSQL data lives at `REPLOFY_POSTGRES_DATA`.
- Filesystem assets live at `REPLOFY_APP_DATA`.
- Both locations must be included in backups.
- Secrets belong in the untracked `.env`, a secrets manager, or your
  orchestrator--not in `compose.yaml`.

CI is configured to exercise a populated same-revision PostgreSQL dump and
restore, check representative record counts, rerun migrations against the
restored database, rehearse a prior-release upgrade and rollback, bootstrap a
clean packaged container, and run MinIO-backed S3 checks. The standalone backup
bundle includes the PostgreSQL dump, filesystem/S3 assets, and a checksum
manifest; run the combined commands below with the server stopped.

## Preview backup and restore commands

With PostgreSQL client tools on `PATH` and `DATABASE_URL` configured:

```bash
npm run backup:postgres
npm run restore:postgres -- ./backups/replofy-os-TIMESTAMP.dump --confirm=RESTORE
npm run backup:standalone
npm run restore:standalone -- ./backups/replofy-os-TIMESTAMP-RANDOM --confirm=RESTORE
```

Backups use PostgreSQL's custom format and receive a SHA-256 sidecar. Restore
verifies that checksum, runs in one transaction, and deliberately requires the
literal confirmation flag because it replaces the target database contents.
The PostgreSQL commands are useful for database-only drills. The standalone
bundle is the safer operational default: it captures `REPLOFY_DATA_DIR` (or
`REPLOFY_APP_DATA` for older Compose environments) alongside the database and
refuses restore without `--confirm=RESTORE`. Keep the bundle outside the data
directory and retain it on a different disk or host.

For a portable, inspectable workspace export (without sessions, passwords,
API-key digests, OAuth tokens, or invitation token hashes), run:

```bash
npm run export:standalone
npm run export:standalone -- --workspace=WORKSPACE_UUID
```

Set `REPLOFY_EXPORT_FILE` to choose the JSON output path. The export is intended
for review, migration, and selective downstream processing; use the standalone
backup bundle for full-fidelity disaster recovery.
