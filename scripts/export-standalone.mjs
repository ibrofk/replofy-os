import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const EXPORT_FORMAT = 'replofy-os-standalone-export';
const EXPORT_VERSION = 1;
const WORKSPACE_TABLES = [
  'workspace_membership',
  'workspace_invitation',
  'task',
  'cycle_goal',
  'vision',
  'prompt',
  'social_post',
  'seo_keyword',
  'feedback',
  'time_block',
  'week_marker',
  'team_chat_channel',
  'team_chat_participant',
  'team_chat_channel_participant',
  'team_chat_message',
  'chat_read_state',
  'notification_read_state',
  'blog_article',
  'creative_item',
  'creative_asset',
  'growth_account',
  'lead',
  'bug',
  'roadmap_item',
  'environment',
  'api_endpoint',
  'environment_deployment',
  'business_plan',
  'business_plan_editing_session',
  'context_source_folder',
  'context_source',
  'context_source_version',
  'context_source_item',
  'operator_desk',
  'operator_work_order',
  'operator_context_pack',
  'operator_checkin',
  'operator_output',
  'operator_injection',
  'operator_approval',
  'operator_memory',
];
const SECRET_KEYS = new Set([
  'token_hash',
  'key_hash',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'value',
  'secret',
  'secret_access_key',
  'api_key',
  'client_secret',
  'private_key',
  'session_token',
  'bootstrap_token',
  'database_url',
  'cookie',
]);

function quoteIdentifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Unsafe export identifier: ${value}`);
  return `"${value}"`;
}

function parseWorkspaceId() {
  const argument = process.argv.find((value) => value.startsWith('--workspace='));
  const value = argument ? argument.slice('--workspace='.length) : process.env.REPLOFY_EXPORT_WORKSPACE_ID;
  if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('REPLOFY_EXPORT_WORKSPACE_ID must be a UUID.');
  }
  return value || null;
}

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SECRET_KEYS.has(key.toLowerCase()))
    .map(([key, entry]) => [key, stripSecrets(entry)]));
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (process.argv.includes('--help')) {
  console.log('Usage: npm run export:standalone [-- --workspace=<uuid>]');
  console.log('Writes REPLOFY_EXPORT_FILE (or exports/replofy-os-export-<timestamp>.json). Auth secrets are excluded.');
  process.exit(0);
}

const workspaceId = parseWorkspaceId();
const outputFile = path.resolve(process.env.REPLOFY_EXPORT_FILE || path.join(
  './exports',
  `replofy-os-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
));
if (path.parse(outputFile).root === outputFile) throw new Error('REPLOFY_EXPORT_FILE cannot be a filesystem root.');

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const workspaceQuery = workspaceId
    ? await client.query('select id, name, slug, metadata, created_at, updated_at from workspace where id = $1::uuid', [workspaceId])
    : await client.query('select id, name, slug, metadata, created_at, updated_at from workspace order by created_at');
  if (workspaceId && workspaceQuery.rows.length === 0) throw new Error('Workspace not found.');
  const ids = workspaceQuery.rows.map((row) => row.id);
  const exportData = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workspaceFilter: workspaceId,
    workspaces: workspaceQuery.rows.map((row) => stripSecrets({
      ...row,
      created_at: isoDate(row.created_at),
      updated_at: isoDate(row.updated_at),
    })),
    users: [],
    tables: {},
  };

  if (ids.length > 0) {
    const users = await client.query(
      `select u.id, u.name, u.email, u.email_verified, u.image, u.created_at, u.updated_at
       from "user" u
       inner join workspace_membership wm on wm.user_id = u.id
       where wm.workspace_id = any($1::uuid[])
       group by u.id, u.name, u.email, u.email_verified, u.image, u.created_at, u.updated_at
       order by u.created_at`,
      [ids],
    );
    exportData.users = users.rows.map((row) => stripSecrets({
      ...row,
      created_at: isoDate(row.created_at),
      updated_at: isoDate(row.updated_at),
    }));
  }

  for (const table of WORKSPACE_TABLES) {
    const query = workspaceId
      ? `select * from ${quoteIdentifier(table)} where workspace_id = $1::uuid order by created_at nulls first`
      : `select * from ${quoteIdentifier(table)} order by created_at nulls first`;
    const result = await client.query(query, workspaceId ? [workspaceId] : []);
    exportData.tables[table] = result.rows.map((row) => stripSecrets(row));
  }

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(exportData, null, 2)}\n`, 'utf8');
  const recordCount = Object.values(exportData.tables).reduce((total, rows) => total + rows.length, 0);
  console.log(`[replofy-os] standalone export created: ${outputFile}`);
  console.log(`[replofy-os] workspaces: ${exportData.workspaces.length}; records: ${recordCount}`);
} finally {
  await client.end();
}
