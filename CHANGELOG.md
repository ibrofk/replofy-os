# Changelog

All notable Replofy OS changes are recorded here. Entries describe the public
behavior and migration impact; implementation details belong in pull requests.

## Unreleased

- Added the PostgreSQL standalone server with local authentication, workspace
  isolation, versioned Drizzle migrations, API keys, and server-sent updates.
- Added filesystem and S3-compatible asset storage, MinIO Compose support, and
  combined database/asset backup and restore workflows.
- Added deterministic standalone seed data, sanitized workspace export, and
  CI coverage for bootstrap, migration, restore, upgrade, rollback, and tenant
  isolation.
- Added standalone product surfaces for execution, planning, content, strategy,
  team chat, creative, growth, technical, systems, and operator workflows.
- Added opt-in Git-history public-safety auditing, a documented dependency
  security policy, and patch-level MCP/Firebase compatibility dependency
  updates.
