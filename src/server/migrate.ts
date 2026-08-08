import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadServerConfig } from './config.js';
import { createPostgresDatabase } from './db/client.js';

const migrationsSchema = 'replofy_meta';
const migrationsTable = 'migrations';

async function bridgeLegacyMigrationLedger(pool: { query: (text: string) => Promise<{ rows: Array<{ exists?: boolean; count?: string }> }> }) {
  const currentLedger = await pool.query(
    `SELECT to_regclass('${migrationsSchema}.${migrationsTable}') IS NOT NULL AS exists`,
  );
  const currentExists = currentLedger.rows[0]?.exists === true;
  if (currentExists) return;

  const legacyLedger = await pool.query(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`,
  );
  if (legacyLedger.rows[0]?.exists !== true) return;

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${migrationsSchema}`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${migrationsSchema}.${migrationsTable} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
  await pool.query(
    `INSERT INTO ${migrationsSchema}.${migrationsTable} (hash, created_at)
     SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`,
  );
  console.log('[replofy-os] migrated the legacy Drizzle migration ledger');
}

async function main() {
  const config = loadServerConfig();
  const { db, pool } = createPostgresDatabase(config.databaseUrl);
  try {
    await bridgeLegacyMigrationLedger(pool);
    await migrate(db, {
      migrationsFolder: process.env.REPLOFY_MIGRATIONS_FOLDER || 'drizzle',
      migrationsSchema,
      migrationsTable,
    });
    console.log('[replofy-os] database migrations complete');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[replofy-os] database migration failed', error);
  process.exitCode = 1;
});
