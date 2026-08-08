# Replofy OS External API Examples

Set these first:

```bash
export REPLOFY_BASE_URL="http://localhost:4000"
export REPLOFY_API_KEY="ros_live_replace_me"
```

PowerShell:

```powershell
$env:REPLOFY_BASE_URL = "http://localhost:4000"
$env:REPLOFY_API_KEY = "ros_live_replace_me"
```

## API Index

```bash
curl "$REPLOFY_BASE_URL/api/v1" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## List Tasks

```bash
curl "$REPLOFY_BASE_URL/api/v1/tasks?limit=25" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Create Task

```bash
curl "$REPLOFY_BASE_URL/api/v1/tasks" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Ship the Replofy MCP server",
    "effortPoints": 5,
    "isLeadIndicator": true,
    "status": "todo"
  }'
```

## Update Task

```bash
curl "$REPLOFY_BASE_URL/api/v1/tasks/<task-id>" \
  -X PATCH \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in-progress"
  }'
```

## List Bugs

```bash
curl "$REPLOFY_BASE_URL/api/v1/bugs?limit=25&status=open" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Create Bug

```bash
curl "$REPLOFY_BASE_URL/api/v1/bugs" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Crash when opening settings",
    "description": "The settings screen throws on first open for new users.",
    "severity": "high",
    "status": "open",
    "resolutionNotes": "",
    "linkedTaskIds": ["task-123", "task-456"],
    "codeLinks": [
      {
        "type": "repository",
        "label": "Helpdesk app",
        "url": "https://github.com/replofy/helpdesk"
      },
      {
        "type": "directory",
        "label": "Settings page",
        "url": "https://github.com/replofy/helpdesk/tree/main/src/pages/settings"
      }
    ]
  }'
```

## Update Bug

```bash
curl "$REPLOFY_BASE_URL/api/v1/bugs/<bug-id>" \
  -X PATCH \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "resolved",
    "resolutionNotes": "Fixed the null branch in the settings loader.",
    "linkedTaskIds": ["task-123"],
    "codeLinks": [
      {
        "type": "directory",
        "label": "Settings loader",
        "url": "src/pages/settings"
      }
    ]
  }'
```

## List Roadmap Items

```bash
curl "$REPLOFY_BASE_URL/api/v1/roadmap-items?limit=25&phase=next" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Create Roadmap Item

```bash
curl "$REPLOFY_BASE_URL/api/v1/roadmap-items" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Dark mode handoff for onboarding",
    "description": "Ship the next onboarding pass with the updated dark visual system.",
    "phase": "next",
    "priority": "high",
    "status": "planned",
    "linkedTaskIds": ["task-789"]
  }'
```

## Update Roadmap Item

```bash
curl "$REPLOFY_BASE_URL/api/v1/roadmap-items/<roadmap-item-id>" \
  -X PATCH \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "now",
    "status": "building",
    "linkedTaskIds": ["task-789", "task-987"]
  }'
```

## Create Prompt

```bash
curl "$REPLOFY_BASE_URL/api/v1/prompts" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy summary prompt",
    "version": "v1.0",
    "content": "Summarize the latest deployment state and next actions."
  }'
```

## Deploy Environment

```bash
curl "$REPLOFY_BASE_URL/api/v1/environments/<environment-id>/deploy" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Extract Context Payload

```bash
curl "$REPLOFY_BASE_URL/api/v1/context-ingestions/extract" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "strategy.md",
    "mimeType": "text/markdown",
    "content": "# Strategy\n\nShip the MCP server and publish the operator docs."
  }'
```

## Ingest Context Document

```bash
curl "$REPLOFY_BASE_URL/api/v1/context-ingestions" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "strategy.md",
    "mimeType": "text/markdown",
    "content": "# Strategy\n\nShip the MCP server and publish the operator docs."
  }'
```

## Blogs Hub

List the `now` content roadmap:

```bash
curl "$REPLOFY_BASE_URL/api/v1/blog-articles?roadmapPhase=now&limit=25" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

Create a structured article with a real brief, evidence card, and linked source registry id:

```bash
curl "$REPLOFY_BASE_URL/api/v1/blog-articles" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Why support automation fails without an escalation map",
    "status": "researching",
    "roadmapPhase": "now",
    "priority": "high",
    "brief": {
      "audience": "Support leaders",
      "painPoint": "Automation hides edge cases instead of resolving them.",
      "thesis": "Automation needs a visible escalation model.",
      "contentCluster": "support-automation"
    },
    "evidence": [{
      "claim": "Escalation ownership is unclear",
      "sourceId": "context-source-123",
      "confidence": "supported",
      "usedInDraft": false
    }],
    "linkedSourceIds": ["context-source-123"],
    "distribution": {
      "primaryKeyword": "support automation",
      "channels": ["LinkedIn", "Newsletter"]
    }
  }'
```

## Start Next Cycle

```bash
curl "$REPLOFY_BASE_URL/api/v1/cycles/start-next" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Weekly Changelog

```bash
curl "$REPLOFY_BASE_URL/api/v1/reports/changelog?week=current" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Create Invitation

```bash
curl "$REPLOFY_BASE_URL/api/v1/invitations" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "operator@example.com",
    "role": "member"
  }'
```

## Team Chat

Register a named AI agent, create a channel, add the identity atomically, and post:

```bash
curl "$REPLOFY_BASE_URL/api/v1/team-chat-participants" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "displayName": "Release Agent", "participantType": "ai-agent" }'

curl "$REPLOFY_BASE_URL/api/v1/team-chat-channels" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "release-room", "topic": "Production release coordination" }'

curl "$REPLOFY_BASE_URL/api/v1/team-chat/channels/<channel-id>/participants" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "participantId": "<participant-id>" }'

curl "$REPLOFY_BASE_URL/api/v1/team-chat-messages" \
  -X POST \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "channelId": "<channel-id>", "participantId": "<participant-id>", "content": "Release candidate is ready." }'
```

Read bounded history with ISO-8601 time windows, sender filters, search text, and cursor pagination:

```bash
curl "$REPLOFY_BASE_URL/api/v1/team-chat/messages?channelId=<channel-id>&participantType=ai-agent&after=2026-05-01T00:00:00Z&query=release&limit=50" \
  -H "x-api-key: $REPLOFY_API_KEY"
```

## Generic CRUD Pattern

```bash
curl "$REPLOFY_BASE_URL/api/v1/<resource>" \
  -H "x-api-key: $REPLOFY_API_KEY"

curl "$REPLOFY_BASE_URL/api/v1/<resource>/<id>" \
  -X PATCH \
  -H "x-api-key: $REPLOFY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "field": "value" }'
```

Main resources:
- `tasks`
- `bugs`
- `roadmap-items`
- `blog-articles`
- `visions`
- `cycle-goals`
- `prompts`
- `api-endpoints`
- `environments`
- `social-posts`
- `creative-items`
- `creative-assets` (read-only metadata)
- `seo-keywords`
- `feedbacks`
- `accounts`
- `leads`
- `time-blocks`
- `team-chat-channels`
- `team-chat-participants`
- `team-chat-messages`
- `context-sources`
- `context-source-versions`
- `users`
- `companies`
- `invitations`
