import { spawnSync } from 'node:child_process';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { isIgnoredPublicDirectory, publicFileRisk } from './lib/public-file-policy.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const canonicalRepositoryRoot = await realpath(repositoryRoot);

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`));
}

async function listFilesystemFiles(directory, relativeDirectory = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      const absolutePath = path.join(directory, entry.name);
      const canonicalPath = await realpath(absolutePath).catch(() => null);
      if (!canonicalPath || !isWithin(canonicalRepositoryRoot, canonicalPath)) {
        throw new Error(`Filesystem safety scan encountered a directory outside the repository: ${relativePath}`);
      }
      if (isIgnoredPublicDirectory(entry.name)) continue;
      files.push(...await listFilesystemFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      const absolutePath = path.join(directory, entry.name);
      const canonicalPath = await realpath(absolutePath).catch(() => null);
      if (!canonicalPath || !isWithin(canonicalRepositoryRoot, canonicalPath)) {
        throw new Error(`Filesystem safety scan encountered a file outside the repository: ${relativePath}`);
      }
      files.push(relativePath);
    } else if (entry.isSymbolicLink()) {
      const absolutePath = path.join(directory, entry.name);
      const canonicalPath = await realpath(absolutePath).catch(() => null);
      if (!canonicalPath || !isWithin(canonicalRepositoryRoot, canonicalPath)) {
        throw new Error(`Filesystem safety scan encountered a symbolic link outside the repository: ${relativePath}`);
      }
      files.push(relativePath);
    }
  }
  return files;
}

const gitEnvironment = { ...process.env };
for (const variable of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  for (const key of Object.keys(gitEnvironment)) {
    if (key.toLowerCase() === variable.toLowerCase()) delete gitEnvironment[key];
  }
}

const candidates = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
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
const canonicalGitRoot = gitRootResult.status === 0
  ? await realpath(gitRootResult.stdout.trim()).catch(() => null)
  : null;

const forbidden = [
  ['production Firebase project id', ['concise', '-vertex-', '412502'].join('')],
  ['production Firestore database id', ['ai-studio-', '28e22827', '-dd18-4dac-aeda-754ce06c26ed'].join('')],
  ['committed Firebase API key', ['AIza', 'Sy'].join('')],
  ['founder-hosted deployment URL', ['replofy-os', '.vercel.app'].join('')],
  ['machine-specific JDK path', ['C:', '\\Program Files\\Eclipse Adoptium'].join('')],
  ['machine-specific workspace path', ['Workspace', '/Replofy'].join('')],
  ['private key material', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
];
const forbiddenPatterns = [
  ['PEM/private key material', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub access token', /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{20,}\b/],
  ['Slack access token', /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
  ['database URL with high-entropy embedded password', /\b(?:postgres(?:ql)?|mysql):\/\/[^/\s:@]+:(?=[^@\s]*[0-9])[^@\s]{16,}@/i],
  ['private-key JSON field', /["'](?:private[_-]?key|secret[_-]?access[_-]?key)["']\s*:\s*["'][^"']{20,}["']/i],
];

const findings = [];
const hasGitMetadata = candidates.status === 0 &&
  canonicalGitRoot !== null &&
  canonicalGitRoot.toLowerCase() === canonicalRepositoryRoot.toLowerCase();
const fileNames = hasGitMetadata
  ? candidates.stdout.split('\0').filter(Boolean)
  : await listFilesystemFiles(repositoryRoot);

if (candidates.error && hasGitMetadata) throw candidates.error;

const maxScanBytes = 10 * 1024 * 1024;

for (const fileName of fileNames) {
  if (fileName === 'scripts/check-public-safety.mjs') continue;

  const fileRisk = publicFileRisk(fileName);
  if (fileRisk) {
    findings.push(`${fileName}: ${fileRisk}`);
    continue;
  }

  let content;
  try {
    const fileInfo = await stat(path.join(repositoryRoot, fileName));
    if (fileInfo.size > maxScanBytes) {
      findings.push(`${fileName}: file exceeds the ${maxScanBytes} byte safety-scan limit`);
      continue;
    }
    content = await readFile(path.join(repositoryRoot, fileName));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    findings.push(`${fileName}: unable to read for safety scan (${error?.code || 'I/O error'})`);
    continue;
  }

  const text = content.toString('utf8');

  for (const [label, value] of forbidden) {
    if (text.includes(value)) findings.push(`${fileName}: ${label}`);
  }
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(text)) findings.push(`${fileName}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error('Public-safety check failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Public-safety check passed across ${fileNames.length} ` +
  `${hasGitMetadata ? 'tracked and untracked non-ignored' : 'filesystem'} files.`,
);
