import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { postgresEnvironment, runPostgresCommand } from './lib/postgres-cli.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: npm run backup:postgres\nRequires DATABASE_URL and pg_dump on PATH.');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const backupDirectory = path.resolve(process.env.REPLOFY_BACKUP_DIR || './backups');
await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDirectory, `replofy-os-${timestamp}.dump`);

await runPostgresCommand(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-privileges', '--file', backupPath],
  postgresEnvironment(databaseUrl),
);

const digest = createHash('sha256').update(await readFile(backupPath)).digest('hex');
await writeFile(`${backupPath}.sha256`, `${digest}  ${path.basename(backupPath)}\n`, 'utf8');
console.log(`[replofy-os] backup created: ${backupPath}`);
console.log(`[replofy-os] SHA-256: ${digest}`);
