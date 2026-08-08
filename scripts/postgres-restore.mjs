import 'dotenv/config';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { postgresDatabaseName, postgresEnvironment, runPostgresCommand } from './lib/postgres-cli.mjs';

if (process.argv.includes('--help')) {
  console.log(
    'Usage: npm run restore:postgres -- <backup.dump> --confirm=RESTORE\n' +
      'Requires DATABASE_URL and pg_restore on PATH. This replaces database contents.',
  );
  process.exit(0);
}

const backupArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const confirmed = process.argv.includes('--confirm=RESTORE');
if (!backupArgument || !confirmed) {
  throw new Error('Restore refused. Supply a backup path and --confirm=RESTORE.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const backupPath = path.resolve(backupArgument);
await access(backupPath);

try {
  const checksumRecord = (await readFile(`${backupPath}.sha256`, 'utf8')).trim();
  const expected = checksumRecord.split(/\s+/)[0]?.toLowerCase();
  const actual = createHash('sha256').update(await readFile(backupPath)).digest('hex');
  if (!expected || expected !== actual) {
    throw new Error(`Backup checksum mismatch: expected ${expected || 'missing'}, calculated ${actual}.`);
  }
  console.log(`[replofy-os] backup checksum verified: ${actual}`);
} catch (error) {
  if ((error).code === 'ENOENT') {
    throw new Error(`Checksum file not found: ${backupPath}.sha256`);
  }
  throw error;
}

await runPostgresCommand(
  'pg_restore',
  [
    '--dbname',
    postgresDatabaseName(databaseUrl),
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    '--single-transaction',
    backupPath,
  ],
  postgresEnvironment(databaseUrl),
);
console.log(`[replofy-os] restore complete: ${backupPath}`);
