# Support

Replofy OS is pre-release software and currently has no guaranteed support SLA.

## Preview support matrix

- **Standalone server:** Node.js 22+, PostgreSQL 18 in CI, and either local
  filesystem assets or an S3-compatible provider.
- **Browser:** the standalone UI is a Vite SPA; no formal browser compatibility
  matrix is promised before 1.0.
- **Optional Firebase path:** Firebase emulators require Java 21+; hosted
  Firebase and Cloudinary integrations remain compatibility adapters.
- **Optional MCP:** Python 3.11+ with the bounded requirements in
  `mcp/requirements.txt`, or the hosted TypeScript endpoint.

The preview target is the latest default-branch commit. No backward-compatibility
promise exists yet for database migrations, API routes, MCP tools, or stored
records beyond the documented migration and backup procedures.

- Use GitHub Issues for reproducible bugs and documentation defects.
- Use feature requests for scoped proposals that explain the user outcome.
- Use the private security reporting process in `SECURITY.md` for vulnerabilities.

Before filing an issue, search existing issues and include the commit or release,
operating system, Node.js version, relevant configuration with secrets removed,
reproduction steps, expected behavior, actual behavior, and logs.

Private deployments, custom integrations, data recovery, and modified forks are
not currently supported by project maintainers.
