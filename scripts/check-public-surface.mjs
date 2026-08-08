import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const requiredFiles = [
  'LICENSE',
  'README.md',
  '.env.example',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'CHANGELOG.md',
  'RELEASE.md',
  'PRIVACY.md',
  'TRADEMARKS.md',
  'docs/ASSET-PROVENANCE.md',
  'docs/self-hosting.md',
  'docs/option-c-completion-matrix.md',
  'docs/public-release-runbook.md',
  'docs/third-party-license-overrides.json',
  'scripts/export-public-root.mjs',
  '.github/workflows/ci.yml',
  'Dockerfile',
  'compose.yaml',
  'drizzle.config.ts',
];

const requiredScripts = [
  'dev:standalone',
  'db:migrate',
  'backup:standalone',
  'restore:standalone',
  'export:standalone',
  'export:public-root',
  'seed:standalone',
  'test:mcp:hosted',
  'test:server:database-reconnect',
  'check:public-safety',
  'check:public-safety:history',
  'check:licenses',
  'check:dependencies',
];

const failures = [];
const requiredContents = new Map();

for (const relativePath of requiredFiles) {
  try {
    const content = await readFile(path.join(root, relativePath), 'utf8');
    requiredContents.set(relativePath, content);
    if (!content.trim()) failures.push(`${relativePath}: file is empty`);
  } catch {
    failures.push(`${relativePath}: required public file is missing`);
  }
}

let packageJson = {};
try {
  packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
} catch (error) {
  failures.push(`package.json: unable to read or parse (${error?.code || 'invalid JSON'})`);
}
if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
  failures.push('package.json: expected a JSON object');
  packageJson = {};
}

if (packageJson.license !== 'Apache-2.0') {
  failures.push(`package.json: expected Apache-2.0 license, found ${String(packageJson.license)}`);
}

for (const scriptName of requiredScripts) {
  if (typeof packageJson.scripts?.[scriptName] !== 'string') {
    failures.push(`package.json: missing ${scriptName} script`);
  }
}

const envExample = requiredContents.get('.env.example') || '';
for (const variable of ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'REPLOFY_BOOTSTRAP_TOKEN', 'REPLOFY_ASSET_STORE']) {
  if (!new RegExp(`^${variable}=`, 'm').test(envExample)) {
    failures.push(`.env.example: missing standalone variable ${variable}`);
  }
}

const readme = requiredContents.get('README.md') || '';
for (const phrase of ['npm run dev:standalone', 'check:public-safety:history', 'docs/self-hosting.md']) {
  if (!readme.includes(phrase)) failures.push(`README.md: missing documented phrase ${phrase}`);
}

const workflow = requiredContents.get('.github/workflows/ci.yml') || '';
const workflowJobs = new Set(
  workflow.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    return match ? [match[1]] : [];
  }),
);
for (const job of ['application', 'windows-runtime', 'postgres-platform', 's3-platform', 'mcp', 'firebase-rules']) {
  if (!workflowJobs.has(job)) failures.push(`.github/workflows/ci.yml: missing ${job} job`);
}

if (failures.length > 0) {
  console.error('Public-surface check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public-surface check passed: ${requiredFiles.length} required files and ${requiredScripts.length} release scripts are present.`);
