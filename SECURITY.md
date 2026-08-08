# Security policy

## Supported versions

Replofy OS is currently pre-release software. Security fixes are applied to the
latest commit on the default branch until the first supported release is
published. A release support table will be added before 1.0.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private
vulnerability reporting flow from the repository **Security** tab:

https://github.com/ibrofk/replofy-os/security/advisories/new

Include affected versions, reproduction steps, impact, and any suggested
mitigation. Do not access data that is not yours, degrade a service, or publish
details before maintainers have had a reasonable opportunity to respond.

The project currently offers no response-time SLA. Receipt, severity, and
disclosure timing will be coordinated through the private advisory.

## Public-history gate

The normal public-safety check scans the working tree for known deployment
identifiers, high-confidence credential formats, private-key material, and
credential-like filenames. Before publishing a public mirror, run
`npm run check:public-safety:history` across every ref that will be exposed. If
it reports a credential or private-key match, rotate the credential and scrub
the history, or start the public mirror from a new clean root commit. These
checks are guardrails, not proof that arbitrary customer data or every secret
format is absent; the working-tree scan also fails closed on unreadable files
and files larger than 10 MiB. Review the complete candidate tree and fetched
ref set.

The dependency check currently scopes out React Router's advisory
`GHSA-qwww-vcr4-c8h2` because the application uses declarative routing and the
source tree contains no unstable RSC router APIs (the lexical guard currently
covers checked-in `src` code). The check fails if those APIs appear or if any
other high/critical production advisory is reported; reassess the exception if
router/server code moves outside that scope.
