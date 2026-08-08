import { copyFile, lstat, mkdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicFileRisk } from './lib/public-file-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outputArgument = outIndex >= 0 ? args[outIndex + 1] : undefined;

if (args.includes('--help') || !outputArgument) {
  console.log('Usage: npm run export:public-root -- --out D:/path/to/replofy-os-public');
  console.log('Copies the reviewed working tree without Git history, ignored files, dependencies, or build output.');
  if (!outputArgument) process.exit(args.includes('--help') ? 0 : 1);
}

const output = path.resolve(outputArgument);
const canonicalRoot = await realpath(root);
const gitEnvironment = { ...process.env };
for (const variable of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
  for (const key of Object.keys(gitEnvironment)) {
    if (key.toLowerCase() === variable.toLowerCase()) delete gitEnvironment[key];
  }
}

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`));
}

async function nearestExistingParent(candidate) {
  let current = path.dirname(candidate);
  while (true) {
    try {
      return await realpath(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`Unable to resolve an existing parent for ${candidate}.`);
      current = parent;
    }
  }
}

const relativeOutput = path.relative(root, output);
if (!relativeOutput || (!path.isAbsolute(relativeOutput) && !relativeOutput.startsWith(`..${path.sep}`))) {
  throw new Error('Refusing to export inside the source checkout. Choose a separate clean-root directory.');
}

const canonicalOutputParent = await nearestExistingParent(output);
if (isWithin(canonicalRoot, canonicalOutputParent)) {
  throw new Error('Refusing to export through a symlink or junction into the source checkout. Choose a separate clean-root directory.');
}

for (const script of ['check-public-surface.mjs', 'check-public-safety.mjs']) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
    env: gitEnvironment,
  });
  if (result.status !== 0) throw new Error(`${script} failed; refusing to export a public root.`);
}

const existing = await lstat(output).catch(() => null);
if (existing) throw new Error(`Refusing to overwrite existing export directory: ${output}`);
const staging = `${output}.tmp-${process.pid}`;
const existingStaging = await lstat(staging).catch(() => null);
if (existingStaging) throw new Error(`Refusing to reuse existing staging directory: ${staging}`);
await mkdir(staging, { recursive: true });
const canonicalStaging = await realpath(staging);
if (isWithin(canonicalRoot, canonicalStaging)) {
  await rm(staging, { recursive: true, force: true });
  throw new Error('Refusing to stage an export inside the source checkout. Choose a separate clean-root directory.');
}

try {
  const gitRootResult = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: gitEnvironment,
  });
  if (gitRootResult.error || gitRootResult.status !== 0) {
    throw new Error(gitRootResult.error?.message || gitRootResult.stderr || 'Source checkout is not a Git worktree.');
  }
  const gitRoot = await realpath(gitRootResult.stdout.trim());
  if (gitRoot.toLowerCase() !== canonicalRoot.toLowerCase()) {
    throw new Error('Refusing to export from a Git worktree rooted outside the source checkout.');
  }

  const filesResult = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    env: gitEnvironment,
  });
  if (filesResult.error) throw filesResult.error;
  if (filesResult.status !== 0) throw new Error(filesResult.stderr || 'Unable to enumerate public files.');

  const files = filesResult.stdout.split('\0').filter(Boolean);
  for (const relativeFile of files) {
    const fileRisk = publicFileRisk(relativeFile);
    if (fileRisk) throw new Error(`Refusing to copy ${fileRisk}: ${relativeFile}`);
    const source = path.resolve(root, relativeFile);
    const target = path.resolve(staging, relativeFile);
    if (!isWithin(root, source) || !isWithin(staging, target)) {
      throw new Error(`Refusing to copy a path outside the repository root: ${relativeFile}`);
    }
    const fileInfo = await lstat(source).catch(() => null);
    if (!fileInfo) continue;
    if (fileInfo.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${relativeFile}`);
    if (!fileInfo.isFile()) continue;
    const canonicalSource = await realpath(source).catch(() => null);
    if (!canonicalSource || !isWithin(canonicalRoot, canonicalSource)) {
      throw new Error(`Refusing to copy a path resolved outside the repository root: ${relativeFile}`);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(canonicalSource, target);
  }

  const packageJson = JSON.parse(await readFile(path.join(staging, 'package.json'), 'utf8'));
  await rename(staging, output);
  console.log(`Public root exported to ${output}`);
  console.log(`Copied ${files.length} non-ignored repository files for ${packageJson.name}.`);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
console.log('Next: cd into that directory, run npm ci, then run the full release verification and history scan.');
