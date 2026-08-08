# Release policy

Replofy OS is pre-release software until a tagged 1.0 release is published.

## Current public-preview status

The reviewed clean-root tree is published at
[`ibrofk/replofy-os`](https://github.com/ibrofk/replofy-os). The source checkout
remains a private audit archive because its reachable Git history contains
legacy production configuration patterns. Service-backed evidence is retained
in the repository's GitHub Actions workflow; the evidence ledger is in
[docs/option-c-completion-matrix.md](docs/option-c-completion-matrix.md).

## Release gates

Every release candidate must pass the repository CI workflow from a clean
checkout, including typecheck, public-safety, the documented dependency
security policy, Firebase rules, PostgreSQL integration, container-restart
persistence and fresh-process reconnect, forced API-process recovery, filesystem and MinIO asset tests, backup/restore,
prior-revision upgrade and rollback, packaged bootstrap, and MCP smoke tests.
The application job also initializes the exported clean root in a temporary
Git repository and runs the history safety scan against that initial commit.
The dependency policy may report the React Router RSC advisory as an explicit
exception while this app remains on declarative routing; reassess that
exception when the routing mode or package support changes.

For any future public mirror or tagged release, run
`npm run check:public-safety:history` against every ref that will be published.
If it reports a finding, rotate the affected credential and scrub the history,
or publish from a new repository whose initial history contains only the clean
tree. A passing working-tree scan does not make an unsafe Git history safe.
Complete [docs/ASSET-PROVENANCE.md](docs/ASSET-PROVENANCE.md) before including
screenshots, logos, banners, or generated artifacts in a public release.
Follow [docs/public-release-runbook.md](docs/public-release-runbook.md) when
preparing a clean public root or an approved history scrub.
Publish and review [PRIVACY.md](PRIVACY.md) with the deployment-specific
retention, deletion, export, provider, and subprocessor disclosures before
operating a hosted service.

The release notes must identify migration changes, supported Node.js and
container versions, storage-provider changes, security fixes, and any data
backup or rollback requirements. Before 1.0, maintainers must also confirm
that the Apache-2.0 code grant and trademark policy are published together.

## Support window

Until 1.0, the latest commit on the default branch is the supported development
target. Tagged releases receive fixes only when the release notes explicitly
state a support window. See `SUPPORT.md` and `SECURITY.md` for issue and
vulnerability-reporting expectations.
