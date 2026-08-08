# Replofy OS MCP Server

This MCP server lets AI clients operate Replofy OS through tools instead of raw HTTP.

## ChatGPT App Endpoint

Replofy OS now exposes a hosted MCP endpoint for ChatGPT Apps SDK connectors:

```text
https://your-replofy-os-domain.com/mcp
```

Local development:

```text
http://localhost:4000/mcp
```

The hosted endpoint uses the TypeScript MCP SDK and advertises ChatGPT-friendly tools such as anchored workspace-object reads, task creation, bug triage, roadmap listing, Blogs Hub planning, changelog generation, and context ingestion. It also registers an iframe widget resource for the Replofy workspace panel.

When an object ID is known, use `get_workspace_object` on the hosted connector or `get_record` on the standalone server. The API treats that object as the anchor and returns a small ranked `relatedContext` section with deterministic inclusion reasons. Broad workspace context remains available through `get_workspace_context`, `workspace_briefing`, and `replofy://context/*` only as a startup or no-anchor fallback.

Runtime routing does not persist inferred links. Existing explicit links and user-approved link writes continue to use the normal resource write APIs.

Production ChatGPT auth uses OAuth 2.1:

```text
Authorization endpoint: https://your-replofy-os-domain.com/oauth/authorize
Token endpoint:         https://your-replofy-os-domain.com/api/oauth/token
Metadata:               https://your-replofy-os-domain.com/.well-known/oauth-authorization-server
Resource metadata:      https://your-replofy-os-domain.com/.well-known/oauth-protected-resource
```

Set these server env vars in production:

```bash
export REPLOFY_CHATGPT_APP_AUTH_MODE="oauth"
export REPLOFY_CHATGPT_APP_BASE_URL="https://your-replofy-os-domain.com"
export REPLOFY_CHATGPT_APP_WIDGET_DOMAIN="https://your-replofy-os-domain.com"
```

If ChatGPT/Codex OAuth reauthentication is blocked, the hosted MCP endpoint can use a server-side Replofy API key as the tool credential. Generate a key from Replofy OS settings first, then enable one of these modes:

```bash
# API-key mode advertises MCP tools as no-auth and injects this key server-side.
export REPLOFY_CHATGPT_APP_AUTH_MODE="api-key"
export REPLOFY_CHATGPT_APP_API_KEY="ros_live_replace_me"

# Hybrid mode still advertises OAuth, but falls back to the server key when no
# Authorization or x-api-key header is sent.
export REPLOFY_CHATGPT_APP_AUTH_MODE="hybrid"
export REPLOFY_CHATGPT_APP_API_KEY="ros_live_replace_me"
```

You can also keep `REPLOFY_CHATGPT_APP_AUTH_MODE="oauth"` and explicitly allow the fallback:

```bash
export REPLOFY_CHATGPT_APP_AUTH_MODE="oauth"
export REPLOFY_CHATGPT_APP_API_KEY_FALLBACK="true"
export REPLOFY_CHATGPT_APP_API_KEY="ros_live_replace_me"
```

PowerShell:

```powershell
$env:REPLOFY_CHATGPT_APP_AUTH_MODE = "api-key"
$env:REPLOFY_CHATGPT_APP_API_KEY = "ros_live_replace_me"
```

Use the narrowest key scopes that work for the tools you need. Server-side key modes are intended for controlled internal connectors because anyone who can reach the endpoint can exercise the advertised tools through that configured key.

Inspector:

```bash
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:4000/mcp --transport http
```

## What It Wraps

The server talks to the secured Replofy API at `/api/v1` using a Replofy API key.

Included tools:
- generic CRUD tools for all Replofy resources
- object reads with deterministic, compact related context
- bugs and roadmap items are exposed through the same CRUD tools as the rest of the workspace
- bug records can include `codeLinks` with plain repository or directory/file links; no Git provider auth is required for the link metadata
- Blogs Hub articles have dedicated local and hosted MCP tools for roadmap phases, briefs, evidence cards, linked source registry ids, and distribution metadata
- Creative Hub items are exposed through CRUD and live context; creative assets are exposed as read-only metadata
- the local FastMCP server exposes the checked-in Replofy OS skill registry through `replofy://skills/registry` and `replofy://skills/{skill_name}`
- Team Chat channels, custom-named human/AI identities, atomic channel membership, message posting, and bounded time-filtered history reads
- task creation and task updates
- prompt creation
- environment deploy and rollback
- cycle rollover
- weekly changelog generation
- context extraction and ingestion
- raw fallback request tool for uncovered routes

## Install

```bash
cd mcp
python -m pip install -r requirements.txt
```

## Required Environment Variables

```bash
export REPLOFY_OS_BASE_URL="http://localhost:4000"
export REPLOFY_OS_API_KEY="ros_live_replace_me"
```

PowerShell:

```powershell
$env:REPLOFY_OS_BASE_URL = "http://localhost:4000"
$env:REPLOFY_OS_API_KEY = "ros_live_replace_me"
```

For the PostgreSQL standalone server, use its externally reachable origin
(Compose defaults to `http://localhost:4100`) and create an `rpo_local_...`
key from the Team screen. Standalone keys are workspace-scoped, shown once,
and support the migrated tasks, cycle-goals, visions, members, events, Team
Chat, structured blog-content, Strategy records, Creative Hub metadata and
authenticated asset downloads, plus Growth Pipeline accounts and leads. The
legacy Firebase adapter is not required by standalone MCP routes.

Standalone bugs and roadmap items support generic MCP CRUD through the
`technical:read` and `technical:write` key scopes.

Standalone Systems records are available through generic endpoint/environment
CRUD plus dedicated deploy, rollback, and deployment-history routes. Use the
`systems:read` and `systems:write` scopes. Deploy and rollback persist an
auditable state transition; an external CI or release runner remains the place
to execute the actual build.

Business Plans use the `workspace:read` and `workspace:write` scopes and retain
revisioned Markdown, structured links, block maps, and editing presence. Context
ingestion uses the `systems` scopes, stores immutable source versions, and puts
extracted records in a human-review queue before any downstream write.

The standalone API also supports generic CRUD for `operator-desks` and
`operator-work-orders`, plus claim and release actions. Context packs,
check-ins, memory state transitions, output submission, proposed injections,
approval decisions, and operator manifests are available under their
`/api/v1/operator-*` routes.

Optional:

```bash
export REPLOFY_OS_TIMEOUT_SECONDS="30"
export REPLOFY_OS_SKILLS_DIR="$PWD/.agents/skills"
```

## Run

Stdio transport:

```bash
python replofy_os_mcp_server.py
```

HTTP transport:

```bash
fastmcp run replofy_os_mcp_server.py:mcp --transport http --port 8001
```

Inspector:

```bash
fastmcp dev replofy_os_mcp_server.py
```

## Client Config

Example MCP client entry:

```json
{
  "mcpServers": {
    "replofy-os": {
      "command": "python",
      "args": ["./mcp/replofy_os_mcp_server.py"],
      "env": {
        "REPLOFY_OS_BASE_URL": "http://localhost:4000",
        "REPLOFY_OS_API_KEY": "ros_live_replace_me"
      }
    }
  }
}
```

## Notes

- Use a company-admin API key if you want invitation writes and the broadest workspace access.
- The MCP server does not issue API keys itself. Generate those from the Replofy OS settings page first.
- Use `download_creative_asset` with a Creative Hub asset id to create an authenticated download URL for an active asset.
- `replofy://config` includes `bugs`, `roadmap-items`, and `blog-articles`, plus direct `replofy://resource/...` entries for quick triage and planning.
- `replofy://context/content` includes Blogs Hub and Creative Hub items. `replofy://blogs/roadmap` groups blog articles into `now`, `next`, and `later`.
- `replofy://skills/registry` lists local Replofy OS workspace skills. Read a full definition from `replofy://skills/{skill_name}`. Override the default `.agents/skills` directory with `REPLOFY_OS_SKILLS_DIR` when needed.
- `replofy://team-chat/channel/{channel_id}/latest/{limit}` exposes bounded recent history for one Team Chat channel.
- `replofy://record/{resource}/{record_id}` returns the requested object first, followed by compact attached and suggested context.
- `replofy_request` is the fallback tool when you need a route that does not yet have a dedicated MCP wrapper.
