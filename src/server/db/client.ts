import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function createPostgresDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const db = drizzle({ client: pool, schema });

  return { db, pool };
}

export type PostgresDatabase = ReturnType<typeof createPostgresDatabase>['db'];
