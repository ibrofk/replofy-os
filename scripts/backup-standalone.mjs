import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { postgresEnvironment, runPostgresCommand } from './lib/postgres-cli.mjs';
import { createS3Client, s3OptionsFromEnvironment } from './lib/s3-client.mjs';

const BUNDLE_VERSION = 1;

function usage() {
  console.log('Usage: npm run backup:standalone\nRequires DATABASE_URL and pg_dump on PATH. Set REPLOFY_ASSET_STORE=s3 to include S3 objects.');
}

if (process.argv.includes('--help')) {
  usage();
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const assetStore = process.env.REPLOFY_ASSET_STORE || 'filesystem';
if (assetStore !== 'filesystem' && assetStore !== 's3') throw new Error('REPLOFY_ASSET_STORE must be filesystem or s3.');

const dataDirectory = path.resolve(process.env.REPLOFY_DATA_DIR || process.env.REPLOFY_APP_DATA || './data');
const backupDirectory = path.resolve(process.env.REPLOFY_BACKUP_DIR || './backups');
const relative = path.relative(dataDirectory, backupDirectory);
if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
  throw new Error('REPLOFY_BACKUP_DIR must not be inside REPLOFY_DATA_DIR.');
}
if (path.parse(dataDirectory).root === dataDirectory) throw new Error('REPLOFY_DATA_DIR cannot be a filesystem root.');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const bundleDirectory = path.join(backupDirectory, `replofy-os-${timestamp}-${randomUUID().slice(0, 8)}`);
const assetsDirectory = path.join(bundleDirectory, 'assets');
const dumpPath = path.join(bundleDirectory, 'database.dump');
await mkdir(assetsDirectory, { recursive: true });

async function copyTree(source, target) {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in backup data: ${sourcePath}`);
    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await copyTree(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await cp(sourcePath, targetPath, { force: true });
    }
  }
}

try {
  await access(dataDirectory);
  await copyTree(dataDirectory, assetsDirectory);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

await runPostgresCommand(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath],
  postgresEnvironment(databaseUrl),
);

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in backup data: ${absolutePath}`);
    if (entry.isDirectory()) files.push(...await collectFiles(root, absolutePath));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function digest(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

const assetEntries = [];
const localAssetFiles = await collectFiles(assetsDirectory);
for (const filePath of localAssetFiles) {
  const details = await stat(filePath);
  assetEntries.push({
    path: path.relative(assetsDirectory, filePath).split(path.sep).join('/'),
    size: details.size,
    sha256: await digest(filePath),
    storage: 'filesystem',
  });
}
if (assetStore === 's3') {
  const s3 = createS3Client(s3OptionsFromEnvironment());
  await s3.ensureBucket();
  const objects = await s3.listObjects();
  for (const object of objects) {
    if (object.key.endsWith('/')) continue;
    const segments = object.key.split('/');
    if (segments.some((segment) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))) {
      throw new Error(`S3 object key contains unsupported backup path characters: ${object.key}`);
    }
    const metadata = await s3.headObject(object.key);
    const source = await s3.getObject(object.key);
    if (!metadata || !source) throw new Error(`S3 object disappeared during backup: ${object.key}`);
    const targetPath = path.join(assetsDirectory, 's3', ...segments);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await pipeline(source.body, createWriteStream(targetPath, { flags: 'wx' }));
    const details = await stat(targetPath);
    assetEntries.push({
      path: path.relative(assetsDirectory, targetPath).split(path.sep).join('/'),
      size: details.size,
      sha256: await digest(targetPath),
      storage: 's3',
      objectKey: object.key,
      contentType: metadata.contentType,
    });
  }
}

const duplicateAssetPath = assetEntries
  .map((entry) => entry.path)
  .find((entryPath, index, all) => all.indexOf(entryPath) !== index);
if (duplicateAssetPath) throw new Error(`Backup asset path collision: ${duplicateAssetPath}`);

const manifest = {
  format: 'replofy-os-standalone-backup',
  version: BUNDLE_VERSION,
  createdAt: new Date().toISOString(),
  assetStore,
  database: {
    file: 'database.dump',
    sha256: await digest(dumpPath),
  },
  assets: assetEntries,
};
await writeFile(path.join(bundleDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[replofy-os] standalone backup created: ${bundleDirectory}`);
console.log(`[replofy-os] assets captured: ${manifest.assets.length}`);
