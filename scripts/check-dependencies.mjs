import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const gitEnvironment = { ...process.env };
for (const variable of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  for (const key of Object.keys(gitEnvironment)) {
    if (key.toLowerCase() === variable.toLowerCase()) delete gitEnvironment[key];
  }
}

function listSourceFiles(directory, relativeDirectory = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  windowsHide: true,
  shell: process.platform === 'win32',
  maxBuffer: 20 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(audit.stdout || '');
} catch {
  console.error(audit.error?.message || audit.stderr || 'npm audit did not return valid JSON.');
  process.exit(1);
}
if (
  audit.error ||
  audit.signal ||
  (typeof audit.status === 'number' && audit.status > 1) ||
  report?.error ||
  !report ||
  typeof report.vulnerabilities !== 'object' ||
  report.vulnerabilities === null ||
  Array.isArray(report.vulnerabilities)
) {
  console.error(audit.error?.message || report?.error?.summary || report?.error || audit.stderr || 'npm audit did not return a complete vulnerability report.');
  process.exit(1);
}

const rscMarkers = /\b(?:RSCHydratedRouter|RSCStaticRouter|RSCStaticRouterProvider|ServerRouter|unstable_RSC)\b/;
const sourceListing = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 128 * 1024 * 1024,
  env: gitEnvironment,
});
const gitRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 1024 * 1024,
  env: gitEnvironment,
});
const canTrustGitSourceListing = existsSync(path.join(repositoryRoot, '.git')) &&
  gitRootResult.status === 0 &&
  realpathSync(gitRootResult.stdout.trim()).toLowerCase() === realpathSync(repositoryRoot).toLowerCase();
const sourceFiles = canTrustGitSourceListing && sourceListing.status === 0
  ? sourceListing.stdout.split(/\r?\n/).filter(Boolean)
  : listSourceFiles(path.join(repositoryRoot, 'src'), 'src');
const rscFiles = sourceFiles.filter((fileName) => {
  try {
    return rscMarkers.test(readFileSync(path.resolve(repositoryRoot, fileName), 'utf8'));
  } catch (error) {
    console.error(`Unable to inspect ${fileName} for RSC APIs: ${error?.message || 'I/O error'}`);
    process.exit(1);
  }
});

const allowedRscAdvisory = 'GHSA-qwww-vcr4-c8h2';
const allowedAdvisoryUrl = new RegExp(`(?:^|/)${allowedRscAdvisory}(?:$|[?#])`, 'i');
const vulnerabilities = Object.entries(report.vulnerabilities || {});
const highOrCritical = vulnerabilities.filter(([, value]) => ['high', 'critical'].includes(value.severity));
const reactRouterReport = highOrCritical.find(([name]) => name === 'react-router')?.[1];
const reactRouterAdvisoryIsAllowed = Boolean(
  reactRouterReport?.via?.length > 0 &&
  reactRouterReport.via.every((entry) => typeof entry === 'object' && typeof entry.url === 'string' && allowedAdvisoryUrl.test(entry.url)),
);
const disallowed = highOrCritical.filter(([name, value]) => {
  if (rscFiles.length > 0) return true;
  if (name === 'react-router') return !reactRouterAdvisoryIsAllowed;
  if (name === 'react-router-dom') {
    return !reactRouterAdvisoryIsAllowed || !value.via?.length || !value.via.every((entry) => entry === 'react-router');
  }
  return true;
});

if (disallowed.length > 0) {
  console.error('Dependency security check failed on high/critical production findings:');
  for (const [name, value] of disallowed) {
    const titles = value.via
      .filter((entry) => typeof entry === 'object')
      .map((entry) => entry.title || entry.url || 'advisory')
      .join('; ');
    console.error(`- ${name}: ${titles || value.severity}`);
  }
  process.exit(1);
}

const ignored = highOrCritical.length - disallowed.length;
const summary = report.metadata?.vulnerabilities || {};
console.log(
  `Dependency security check passed: ${summary.total ?? vulnerabilities.length} production advisories; ` +
  `${ignored} React Router RSC advisory path(s) explicitly scoped out because no RSC APIs are present.`,
);
