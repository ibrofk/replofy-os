# Privacy and data handling (pre-release)

This is an informational, pre-release disclosure for self-hosting and
development. It is not legal advice and does not replace a product-specific
privacy notice, data-processing agreement, retention schedule, or subprocessor
review.

## What a standalone instance can store

Depending on the features and integrations an operator enables, a standalone
instance can store:

- account identity such as name and email address, a password hash, sessions,
  workspace memberships, invitations, and API-key digests;
- workspace content such as tasks, plans, goals, strategy records, chat,
  operator work, leads, context-ingestion records, and configuration;
- uploaded or generated asset files and their metadata in the configured
  filesystem or S3-compatible object store; and
- operational logs, migration state, backups, and export files created by the
  operator's deployment.

The application should not treat backups, logs, object storage, or database
exports as automatically anonymous. Protect them with the same care as the
primary instance and set an operator-defined retention and deletion schedule.

## Optional third-party processing

- Gemini is contacted only when an operator configures `GEMINI_API_KEY` and
  selects an AI-assisted extraction or generation path. If Gemini is not
  configured, supported local fallback paths can run without that provider.
- Cloudinary is part of the hosted Firebase compatibility path when its
  integration is configured; it is not required by the standalone filesystem
  or S3-compatible AssetStore.
- An S3-compatible provider receives asset objects and requests made by the
  configured operator. The provider, region, access policy, and retention are
  deployment choices.

Review each provider's current terms, privacy documentation, residency, and
retention controls before sending personal, confidential, or regulated data.

## Export and deletion boundaries

The standalone export path is intended to preserve workspace data for
migration or backup. It omits active sessions, password hashes, API-key
digests, invitation-token hashes, OAuth credentials, and other authentication
secrets. Operators remain responsible for deleting the source database,
object-store keys, logs, backups, and provider-side copies when their policy or
law requires it.

## Telemetry and access

No analytics or telemetry SDK is included in the checked-in application. This
does not prevent an operator, reverse proxy, hosting provider, error monitor,
or third-party integration from collecting request, diagnostic, or usage data.
Review server logs and infrastructure settings before production use.

## Hosted deployments and pre-1.0 work

Hosted Firebase deployments have different identity, storage, provider, and
subprocessor responsibilities from a standalone instance. Before a 1.0
release, maintainers must publish the hosted privacy notice, contact channel,
retention/deletion schedule, data-subject export and deletion procedure, and
subprocessor list that apply to any service they operate.
