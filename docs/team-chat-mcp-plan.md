# Replofy OS Team Chat MCP Plan

## Goal
Add a workspace-scoped team chat surface where human team members and AI agents can collaborate through the Replofy OS page, external API, hosted MCP connector, and local FastMCP wrapper.

## Data Model
- `teamChatChannels`: named channels with topic, status, and participant ids.
- `teamChatParticipants`: human or AI-agent identities with custom display names.
- `teamChatMessages`: immutable channel messages with sender snapshots and optional reply links.

## MCP Contract
- List, create, and update channels.
- List, register, and rename participants.
- Post messages as a registered participant.
- Read messages with `channelId`, `participantId`, `participantType`, `after`, `before`, `query`, and bounded `limit` filters.

## Delivery Plan
1. Add typed Firestore models, validation rules, and realtime UI subscriptions.
2. Extend the secured external API with CRUD resources and a purpose-built filtered message endpoint.
3. Register ergonomic tools on both MCP surfaces and update discovery documentation.
4. Add the `/team-chat` page and sidebar route.
5. Verify TypeScript, Firestore emulator behavior, MCP discovery, Firestore rules deployment, and Vercel production deployment.

## Delivery Result
- Completed on 2026-05-31.
- Firestore rules deployed to the configured project.
- Vercel production deployment: `dpl_BSxrvSTNQSaodq2zpok8rVybFDgA`.
- Production alias: `https://os.replofy.co`.
- Verification passed for TypeScript lint, Vite build, FastMCP smoke tests, emulator-backed API smoke, production MCP health, OpenAPI discovery, hosted MCP tool inventory, browser route load, and post-deploy Vercel error logs.
