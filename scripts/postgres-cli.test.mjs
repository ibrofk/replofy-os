import assert from 'node:assert/strict';
import test from 'node:test';
import { postgresEnvironment } from './lib/postgres-cli.mjs';

test('postgresEnvironment extracts connection fields without retaining DATABASE_URL', () => {
  const environment = postgresEnvironment(
    'postgresql://replofy:p%40ss@db.example.test:5544/replofy_os?sslmode=require',
    { DATABASE_URL: 'must-not-leak', SAFE_VALUE: 'kept' },
  );

  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.PGHOST, 'db.example.test');
  assert.equal(environment.PGPORT, '5544');
  assert.equal(environment.PGDATABASE, 'replofy_os');
  assert.equal(environment.PGUSER, 'replofy');
  assert.equal(environment.PGPASSWORD, 'p@ss');
  assert.equal(environment.PGSSLMODE, 'require');
  assert.equal(environment.SAFE_VALUE, 'kept');
});

test('postgresEnvironment rejects non-PostgreSQL URLs', () => {
  assert.throws(() => postgresEnvironment('https://example.test/database'), /postgres/);
});
