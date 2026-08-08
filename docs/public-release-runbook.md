# Public release runbook

This runbook separates reversible repository preparation from the irreversible
act of publishing Git history. It assumes the current tree is the candidate
release and that `npm run check:public-safety:history` may still report legacy
refs.

## 1. Rotate and review

Before publishing anything:

1. Rotate or revoke every credential identified by the history scan, including
   Firebase API keys, service-account material, deployment credentials, and
   provider tokens.
2. Confirm that the candidate tree contains no `.env`, emulator export,
   database dump, backup bundle, customer data, or generated provider output.
3. Complete [docs/ASSET-PROVENANCE.md](ASSET-PROVENANCE.md),
   [TRADEMARKS.md](../TRADEMARKS.md), and [PRIVACY.md](../PRIVACY.md) review.

## 2. Prefer a clean public root when history is unsafe

When reachable history cannot be scrubbed with an approved procedure, create a
new repository whose first commit contains only the reviewed clean tree. Do
not copy `.git`, `node_modules`, `dist`, `dist-server`, `.tmp`, `data`,
`emulator_data`, `.env`, or backup directories. Keep the original repository
private as an audit archive until its credentials and retention policy are
handled.

The current checkout provides a non-destructive exporter for this clean-root
step. Choose a target directory outside this checkout; it refuses to overwrite
an existing directory, follows no symlink or junction into the source checkout,
rejects credential-like/generated filenames, and runs the public-surface and
working-tree safety gates before copying:

```powershell
npm run export:public-root -- --out D:/ReplofyPublic/replofy-os
```

The output contains the reviewed working tree only; it has no `.git` history,
ignored files, dependencies, or generated paths covered by the export policy.
Review any custom output directories before publishing. From the exported root,
review the files, initialize Git, create the reviewed initial commit, then run
`npm ci`, the verification commands below, and
`npm run check:public-safety:history` before pushing any public ref:

```bash
git init
git add .
git commit -m "Initial public Replofy OS tree"
```

The application CI job repeats this clean-root initialization in a temporary
runner directory and runs `check:public-safety:history` against the resulting
initial commit. That proves the clean-root fallback path, but it does not make
the source checkout's existing history safe to publish.

From the clean checkout, run:

```bash
npm ci
python -m pip install --requirement mcp/requirements.txt
python -m unittest discover -s mcp/tests -p "test_*.py"
npm run check
npm run server:build
npm run build:firebase
npm run build:standalone -- --manifest --outDir .tmp/standalone-release
node scripts/check-standalone-bundle.mjs .tmp/standalone-release
npm run check:public-safety:history
```

`npm run check:licenses` can audit the lockfile without an installed
`node_modules`; the release build, tests, and MCP dependency suite still need
their documented runtime installs. Any package whose lockfile entry omits a
license must remain listed in `docs/third-party-license-overrides.json` with a
reviewed license-file path.

The history scan must pass against every ref that will be published. It covers
known credential formats and credential-like historical paths, but it is not a
complete proof that arbitrary customer data or every secret format is absent;
review the full candidate tree and fetched ref set. The working-tree scan also
fails closed on I/O errors (except files that disappear during the scan) and
files larger than 10 MiB; its filename policy is intentionally conservative
and heuristic. A working-tree scan alone is not sufficient.

## 3. If preserving history is required

Use an approved history-rewrite tool and procedure, coordinate the new commit
identities with every collaborator, rotate credentials before and after the
rewrite, and verify all branches, tags, and remote refs. Never force-push a
rewritten public history from this working tree without explicit authorization.

## 4. CI and release artifact

Run the full GitHub workflow from the clean root. Retain the PostgreSQL
integration, container-restart and fresh-process reconnect, forced API-process recovery, MinIO, Firebase rules, MCP, backup/restore,
upgrade/rollback, and container bootstrap logs with the release candidate.
Publish release notes that identify the migration ledger, supported runtime
versions, storage-provider behavior, security fixes, and backup/rollback
requirements.
