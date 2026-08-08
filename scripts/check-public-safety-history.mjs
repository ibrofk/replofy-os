import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { publicFileRisk } from './lib/public-file-policy.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const gitEnvironment = { ...process.env };
for (const variable of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  for (const key of Object.keys(gitEnvironment)) {
    if (key.toLowerCase() === variable.toLowerCase()) delete gitEnvironment[key];
  }
}
const gitOptions = {
  cwd: repositoryRoot,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 32 * 1024 * 1024,
  env: gitEnvironment,
};

const gitRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], { ...gitOptions, maxBuffer: 1024 * 1024 });
if (gitRootResult.error || gitRootResult.status !== 0) {
  console.error(gitRootResult.error?.message || gitRootResult.stderr || 'Unable to resolve the local Git worktree.');
  process.exit(1);
}
const gitRoot = realpathSync(gitRootResult.stdout.trim());
if (gitRoot.toLowerCase() !== realpathSync(repositoryRoot).toLowerCase()) {
  console.error('Unable to scan Git history: Git resolved to a different worktree.');
  process.exit(1);
}

const patterns = [
  { label: 'production Firebase project id', value: ['concise', '-vertex-', '412502'].join(''), fixed: true },
  { label: 'production Firestore database id', value: ['ai-studio-', '28e22827', '-dd18-4dac-aeda-754ce06c26ed'].join(''), fixed: true },
  { label: 'committed Firebase API key', value: ['AIza', 'Sy'].join(''), fixed: true },
  { label: 'founder-hosted deployment URL', value: ['replofy-os', '.vercel.app'].join(''), fixed: true },
  { label: 'machine-specific JDK path', value: ['C:', '\\Program Files\\Eclipse Adoptium'].join(''), fixed: true },
  { label: 'machine-specific workspace path', value: ['Workspace', '/Replofy'].join(''), fixed: true },
  { label: 'private key material', value: ['-----BEGIN ', 'PRIVATE KEY-----'].join(''), fixed: true },
  { label: 'PEM/private key material', value: '-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----', fixed: false },
  { label: 'AWS access key', value: 'AKIA[0-9A-Z]{16}', fixed: false },
  { label: 'GitHub access token', value: '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})', fixed: false },
  { label: 'Slack access token', value: 'xox[baprs]-[0-9A-Za-z-]{20,}', fixed: false },
  { label: 'Google API key', value: 'AIza[0-9A-Za-z_-]{20,}', fixed: false },
  { label: 'database URL with high-entropy embedded password', value: '(postgres|postgresql|mysql)://[^[:space:]/:@]+:[^[:space:]@]{16,}[0-9][^[:space:]@]*@', fixed: false },
];

const commits = spawnSync('git', ['rev-list', '--all'], {
  ...gitOptions,
});
if (commits.error || commits.signal || commits.status !== 0) {
  console.error(commits.stderr || 'Unable to list Git history.');
  process.exit(1);
}

const commitList = commits.stdout.split(/\r?\n/).filter(Boolean);
const findings = [];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternGroups = [
  {
    label: 'known public-safety pattern',
    patterns: patterns.filter((pattern) => pattern.fixed),
  },
  {
    label: 'high-confidence credential format',
    patterns: patterns.filter((pattern) => !pattern.fixed),
  },
];
for (const group of patternGroups) {
  const expression = group.patterns
    .map((pattern) => `(${pattern.fixed ? escapeRegex(pattern.value) : pattern.value})`)
    .join('|');
  for (let offset = 0; offset < commitList.length; offset += 100) {
    const batch = commitList.slice(offset, offset + 100);
    const result = spawnSync('git', [
      'grep', '--no-color', '--text', '-n', '-E', '-e', expression, ...batch, '--',
    ], gitOptions);
    if (result.error || result.signal || result.status === null || result.status > 1) {
      console.error(result.error?.message || result.stderr || `Unable to scan Git history for ${group.label}.`);
      process.exit(1);
    }
    if (result.status === 0) {
      for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
        const commit = line.match(/^([0-9a-f]{7,40}):/)?.[1];
        if (!commit) continue;
        const matchedLabels = group.patterns
          .filter((pattern) => pattern.fixed && line.includes(pattern.value))
          .map((pattern) => pattern.label);
        for (const label of matchedLabels.length > 0 ? matchedLabels : [group.label]) {
          findings.push({ commit, label });
        }
      }
    }
  }
}

const historicalPaths = spawnSync('git', [
  'log', '--all', '--no-renames', '--name-only', '--format=__REPOLOGY_COMMIT__%H', '--',
], { ...gitOptions, maxBuffer: 128 * 1024 * 1024 });
if (historicalPaths.error || historicalPaths.signal || historicalPaths.status !== 0) {
  console.error(historicalPaths.error?.message || historicalPaths.stderr || 'Unable to scan historical paths.');
  process.exit(1);
}
let historicalCommit = null;
for (const line of historicalPaths.stdout.split(/\r?\n/)) {
  const commitMarker = line.match(/^__REPOLOGY_COMMIT__([0-9a-f]{40})$/);
  if (commitMarker) {
    historicalCommit = commitMarker[1];
    continue;
  }
  if (!historicalCommit || !line) continue;
  const fileRisk = publicFileRisk(line);
  if (fileRisk) findings.push({ commit: historicalCommit, label: `historical ${fileRisk}` });
}

if (findings.length > 0) {
  console.error('Git-history public-safety check failed. Scrub these refs before publication:');
  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.commit}:${finding.label}`, finding);
  for (const { commit, label } of unique.values()) {
    console.error(`- ${commit.slice(0, 12)}: ${label}`);
  }
  process.exit(1);
}

console.log(`Git-history public-safety check passed across ${commitList.length} commits.`);
