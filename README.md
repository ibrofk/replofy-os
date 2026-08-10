# Replofy OS

Replofy OS is an open-source workspace for planning, execution, content,
growth, team communication, and AI-assisted operations.

> **Release status:** pre-release. The repository now contains a PostgreSQL
> standalone preview alongside the Firebase development path. CI is configured
> to prove the combined backup/restore path, prior-release upgrade and rollback
> rehearsal, and clean-install bootstrap. Filesystem and S3-compatible asset
> stores are available behind the standalone AssetStore boundary, and the
> standalone bundle exports/restores configured S3 objects. The legacy Firebase
> adapter remains available for hosted compatibility; standalone strategy,
> planning, growth, technical, and operator data use PostgreSQL.
>
> **Public preview:** the reviewed clean-root repository is published at
> [github.com/ibrofk/replofy-os](https://github.com/ibrofk/replofy-os). Its
> public history starts at a clean root; the original source checkout remains
> a private audit archive because its reachable legacy refs still require
> credential rotation and history scrubbing. The current CI evidence is tracked
> in [the Actions workflow](https://github.com/ibrofk/replofy-os/actions).
> For a future mirror or fork, run `npm run check:public-safety:history` across
> every ref you intend to expose and use the clean-root exporter when needed.

## Run Locally

**Prerequisites:** Node.js 22 or newer. Java 21 or newer is needed only for
the Firebase emulator workflow; the standalone PostgreSQL server does not
start a Java process.


1. Install exact dependencies with `npm ci`.
2. Copy `.env.example` to `.env` (`.env.local` is also accepted by Vite-only development).
3. Run `npm run preflight`.
4. Start PostgreSQL and run `npm run dev:standalone` for the primary self-hosted path.
   Use `npm run dev:all` only for the Firebase compatibility workflow; it also
   starts the Firebase emulators and therefore requires Java 21.

Gemini and Cloudinary are optional during local development. Never put
production Firebase credentials or project identifiers in repository files.

## PostgreSQL platform work

The standalone self-hosting substrate is under active development. Its current
foundation includes versioned Drizzle migrations, local email/password auth,
multiple workspace memberships, one-time token-protected instance bootstrap,
live/readiness health endpoints, workspace-isolated APIs, filesystem asset
storage, API keys, an MCP-compatible external API, server-sent updates, and a
preview Compose stack. The standalone browser currently covers Execution,
Tasks, Team Chat, structured Content, Strategy, Creative Hub, Growth Pipeline,
Technical Studio, Systems (environment state, endpoint inventory, and
deployment history), Plans & Context (revisioned plans plus reviewable
ingestion), Operator Desks, Team management, and the workspace-wide AI context
engine. The standalone header exposes AI status, `/settings` for provider/model
configuration and provider testing, and `/ai` for chat, source analysis,
proposals, autonomous memory history, and run diagnostics.

Standalone application services consume explicit `WorkspaceRepository`,
`AuthProvider`, `AIProvider`, `AssetStore`, and `WorkspaceEventBus` boundaries.
The default adapters are PostgreSQL/Better Auth, Gemini with local fallback,
filesystem or S3-compatible assets, and in-process workspace events.

The standalone server commands are:

```text
npm run db:generate
npm run db:migrate
npm run server:dev
npm run server:build
npm run server:migrate
npm run seed:standalone
npm run export:standalone
```

With PostgreSQL already running and the standalone values in `.env`,
`npm run dev:standalone` applies migrations, starts the API on port 4100, and
starts a standalone Vite proxy on port 4000. Docker is only needed for the
Compose packaging path.

These commands require the PostgreSQL environment values documented in
`.env.example`. The legacy Firebase adapter remains available for hosted
compatibility, while standalone navigation and API routes use PostgreSQL and
the configured filesystem/S3-compatible AssetStore.

See [docs/self-hosting.md](docs/self-hosting.md) for the preview stack,
including how to place persistent database and asset data on D: under Windows.
The implementation and release handoff are tracked in
[docs/option-c-completion-matrix.md](docs/option-c-completion-matrix.md).
Code is Apache-2.0 licensed; see [TRADEMARKS.md](TRADEMARKS.md) for use of the
Replofy name and logos.
Asset ownership and screenshot provenance are tracked in
[docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md).
The pre-release data-handling disclosure is in [PRIVACY.md](PRIVACY.md);
operators must adapt it to their deployment and legal obligations.

## API Keys

The app includes a `Settings` page for issuing and revoking API keys.

- Keys are shown once at creation time.
- Only SHA-256 hashes are stored server-side.
- External API requests use `x-api-key` for authentication and scope checks.

## External API

Base path: `/api/v1`
Self-hosted base URL: `${REPLOFY_SERVER_URL}/api/v1` (Compose defaults to
`http://localhost:4100/api/v1`; the Firebase/Vite compatibility path uses
`http://localhost:4000/api/v1`).

Authentication:
- Hosted Firebase compatibility keys use `x-api-key: ros_live_...`.
- Standalone PostgreSQL keys use `x-api-key: rpo_local_...`.
- `Authorization: Bearer <key>` also works for external API requests.

Discovery:
- `GET /api/v1` returns the available resources and action routes for the current API version

Core resources:
- `tasks`
- `bugs`
- `roadmap-items`
- `blog-articles`
- `visions`
- `cycle-goals`
- `prompts`
- `business-plans`
- `api-endpoints`
- `environments`
- `social-posts`
- `creative-items`
- `creative-assets` (metadata plus authenticated upload/download actions)
- `seo-keywords`
- `feedbacks`
- `accounts`
- `leads`
- `time-blocks`
- `week-markers`
- `mcp-registry`
- `team-chat-channels`
- `team-chat-participants`
- `team-chat-messages`
- `context-sources`
- `context-source-versions`
- `users`
- `companies`
- `invitations`

Resource patterns:
- `GET /api/v1/<resource>`
- `GET /api/v1/<resource>/<id>`
- `POST /api/v1/<resource>`
- `PATCH /api/v1/<resource>/<id>`
- `DELETE /api/v1/<resource>/<id>`

Special action routes:
- `POST /api/v1/context-ingestions/extract`
- `POST /api/v1/context-ingestions`
- `POST /api/v1/environments/:id/deploy`
- `POST /api/v1/environments/:id/rollback`
- `POST /api/v1/cycles/start-next`
- `GET /api/v1/reports/changelog?week=current|last`
- `GET /api/v1/team-chat/messages?channelId=:id&after=:iso&before=:iso&query=:text&limit=50`
- `POST /api/v1/team-chat/channels/:id/participants`

Context ingestion request body:
```json
{
  "fileName": "strategy.md",
  "content": "# Strategy\n...",
  "mimeType": "text/markdown"
}
```

Notes:
- List endpoints support `limit` plus simple equality filters such as `status`, `role`, `platform`, and similar resource fields.
- Context source records and versions are read-only over CRUD; write access goes through the ingestion endpoints so lineage stays consistent.
- Context ingestion can extract `creative` items and write lineage-linked Creative Hub ideas and briefs.
- Firebase-mode Creative asset uploads remain on `/api/internal/creative-assets`.
  Standalone mode accepts authenticated binary uploads at
  `/api/v1/creative-assets/upload` and returns authenticated download metadata
  from `GET /api/v1/creative-assets/:id/download`.
- Team Chat stores immutable sender snapshots. Use the filtered message route for bounded history reads and the channel membership action for atomic participant assignment.
- Hosted Firebase compatibility invitations remain admin-only even when a
  hosted API key has `identity:write`; standalone invitation management uses
  the authenticated PostgreSQL session and enforces the workspace role.
- The standalone server's canonical operator model is `operator_*` PostgreSQL
  tables. Legacy Firebase `agenticTasks` and `osOperators` records remain a
  hosted-compatibility concern and are not imported by standalone bootstrap.

Operator assets:
- Postman collection: [postman/Replofy-OS-API.postman_collection.json](postman/Replofy-OS-API.postman_collection.json)
- Postman environment: [postman/Replofy-OS-Local.postman_environment.json](postman/Replofy-OS-Local.postman_environment.json)
- Postman environment: [postman/Replofy-OS-Production.postman_environment.json](postman/Replofy-OS-Production.postman_environment.json)
- Curl examples: [docs/external-api-examples.md](docs/external-api-examples.md)

## Creative Hub Storage

In Firebase mode, Creative Hub metadata stays in Firestore and files upload
directly to Cloudinary through signed parameters issued by
`/api/internal/creative-assets`. In standalone mode, metadata is stored in
PostgreSQL and files are streamed into the configured workspace-isolated
filesystem or S3-compatible AssetStore.
Create a Cloudinary product environment and configure either `CLOUDINARY_URL`:

```bash
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Or set the split variables:

```bash
CLOUDINARY_CLOUD_NAME=CLOUD_NAME
CLOUDINARY_API_KEY=API_KEY
CLOUDINARY_API_SECRET=API_SECRET
```

Assets are uploaded using Cloudinary's `authenticated` delivery type. Replofy verifies Cloudinary's upload response signature before activating an asset and returns signed delivery URLs only after checking workspace access.

## MCP Server

An internal FastMCP server is included in [mcp/replofy_os_mcp_server.py](mcp/replofy_os_mcp_server.py).
Object reads use deterministic relevance routing: the requested record is returned first, followed by compact attached and suggested context. Broad workspace snapshots remain available only for startup or no-anchor fallback use.

Setup docs:
- [mcp/README.md](mcp/README.md)

Install:
`python -m pip install -r mcp/requirements.txt`

Run:
`python mcp/replofy_os_mcp_server.py`
