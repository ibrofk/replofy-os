import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://replofy:replofy-local-change-me@127.0.0.1:5432/replofy',
  },
  migrations: {
    schema: 'replofy_meta',
    table: 'migrations',
  },
  strict: true,
  verbose: true,
});
