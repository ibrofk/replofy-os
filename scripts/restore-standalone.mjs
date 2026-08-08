import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { postgresDatabaseName, postgresEnvironment, runPostgresCommand } from './lib/postgres-cli.mjs';
import { createS3Client, s3OptionsFromEnvironment } from './lib/s3-client.mjs';

const BUNDLE_VERSION = 1;

function safePathSegments(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`Backup manifest contains an invalid ${label} path.`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`Backup manifest contains an absolute ${label} path.`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`Backup manifest contains an unsafe ${label} path.`);
  }
  return segments;
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

if (process.argv.includes('--help')) {
  console.log('Usage: npm run restore:standalone -- <backup-directory> --confirm=RESTORE\nRequires DATABASE_URL and pg_restore on PATH. S3 bundles require REPLOFY_ASSET_STORE=s3.');
  process.exit(0);
}

const bundleArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (!bundleArgument || !process.argv.includes('--confirm=RESTORE')) {
  throw new Error('Restore refused. Supply a backup directory and --confirm=RESTORE.');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const bundleDirectory = path.resolve(bundleArgument);
const dataDirectory = path.resolve(process.env.REPLOFY_DATA_DIR || process.env.REPLOFY_APP_DATA || './data');
if (path.parse(dataDirectory).root === dataDirectory) throw new Error('REPLOFY_DATA_DIR cannot be a filesystem root.');
const relative = path.relative(dataDirectory, bundleDirectory);
if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
  throw new Error('Backup bundle must not be inside REPLOFY_DATA_DIR.');
}

const manifestPath = path.join(bundleDirectory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (
  manifest?.format !== 'replofy-os-standalone-backup' ||
  manifest?.version !== BUNDLE_VERSION ||
  !manifest.database ||
  !isSha256(manifest.database.sha256) ||
  !Array.isArray(manifest.assets)
) {
  throw new Error('Unsupported Replofy OS backup manifest.');
}
const manifestAssetStore = manifest.assetStore || 'filesystem';
if (manifestAssetStore !== 'filesystem' && manifestAssetStore !== 's3') {
  throw new Error('Backup manifest contains an unsupported asset store.');
}
const dumpPath = path.join(bundleDirectory, ...safePathSegments(manifest.database.file, 'database dump'));
const assetsDirectory = path.join(bundleDirectory, 'assets');
const digest = async (filePath) => createHash('sha256').update(await readFile(filePath)).digest('hex');
const dumpDetails = await lstat(dumpPath);
if (!dumpDetails.isFile()) throw new Error('Backup database dump is not a regular file.');
if (await digest(dumpPath) !== manifest.database.sha256) throw new Error('Database dump checksum mismatch.');
const assetEntries = [];
const s3Entries = [];
const seenAssetPaths = new Set();
for (const entry of manifest.assets) {
  const segments = safePathSegments(entry?.path, 'asset');
  const displayPath = segments.join('/');
  if (seenAssetPaths.has(displayPath)) throw new Error(`Backup manifest contains a duplicate asset path: ${displayPath}`);
  if (!Number.isSafeInteger(entry?.size) || entry.size < 0 || !isSha256(entry?.sha256)) {
    throw new Error(`Backup manifest contains invalid metadata for asset: ${displayPath}`);
  }
  seenAssetPaths.add(displayPath);
  const filePath = path.join(assetsDirectory, ...segments);
  const details = await lstat(filePath);
  if (!details.isFile() || details.size !== entry.size || await digest(filePath) !== entry.sha256) {
    throw new Error(`Asset checksum mismatch: ${displayPath}`);
  }
  const storage = entry.storage || manifestAssetStore;
  if (storage !== 'filesystem' && storage !== 's3') throw new Error(`Unsupported asset storage: ${displayPath}`);
  if (storage === 's3') {
    const objectKey = entry.objectKey;
    const objectSegments = safePathSegments(objectKey, 'S3 object');
    if (typeof entry.contentType !== 'string' || !entry.contentType.trim()) {
      throw new Error(`S3 asset is missing content type: ${displayPath}`);
    }
    s3Entries.push({ displayPath, segments, objectKey: objectSegments.join('/'), contentType: entry.contentType, size: details.size });
  } else {
    assetEntries.push({ displayPath, segments });
  }
}

if (s3Entries.length > 0 && process.env.REPLOFY_ASSET_STORE !== 's3') {
  throw new Error('This backup contains S3 objects. Set REPLOFY_ASSET_STORE=s3 and provide S3 credentials before restoring.');
}
const s3 = s3Entries.length > 0
  ? createS3Client(s3OptionsFromEnvironment())
  : undefined;

const stagingDirectory = `${dataDirectory}.restore-${randomUUID()}`;
const previousDirectory = `${dataDirectory}.before-restore-${randomUUID()}`;
await mkdir(stagingDirectory, { recursive: true });
const uploadedS3Keys = [];
try {
  for (const entry of assetEntries) {
    const sourcePath = path.join(assetsDirectory, ...entry.segments);
    const targetPath = path.join(stagingDirectory, ...entry.segments);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
  }

  if (s3) {
    for (const entry of s3Entries) {
      const sourcePath = path.join(assetsDirectory, ...entry.segments);
      await s3.putObject(entry.objectKey, createReadStream(sourcePath), entry.contentType, entry.size);
      uploadedS3Keys.push(entry.objectKey);
    }
  }

  await runPostgresCommand(
    'pg_restore',
    ['--dbname', postgresDatabaseName(databaseUrl), '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', dumpPath],
    postgresEnvironment(databaseUrl),
  );

  let movedPrevious = false;
  try {
    try {
      await rename(dataDirectory, previousDirectory);
      movedPrevious = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rename(stagingDirectory, dataDirectory);
    if (movedPrevious) await rm(previousDirectory, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    if (movedPrevious) await rename(previousDirectory, dataDirectory).catch(() => undefined);
    throw error;
  }
} catch (error) {
  if (uploadedS3Keys.length > 0) console.warn('[replofy-os] S3 restore stopped after uploading some objects; rerun restore after fixing the error.');
  await rm(stagingDirectory, { recursive: true, force: true });
  throw error;
}
console.log(`[replofy-os] standalone restore complete: ${bundleDirectory}`);
