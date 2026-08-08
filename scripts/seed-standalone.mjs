import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Client } from 'pg';

function uuidFor(workspaceId, label) {
  const bytes = createHash('sha256').update(`${workspaceId}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function quoteIdentifier(value) {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Unsafe seed identifier: ${value}`);
  return `"${value}"`;
}

async function upsert(client, table, row, conflictColumns = ['id']) {
  const columns = Object.keys(row);
  const quotedColumns = columns.map(quoteIdentifier);
  const conflictTarget = conflictColumns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`);
  await client.query(
    `insert into ${quoteIdentifier(table)} (${quotedColumns.join(', ')}) values (${placeholders.join(', ')}) on conflict (${conflictTarget}) do update set ${updates.join(', ')}`,
    columns.map((column) => row[column]),
  );
}

if (process.argv.includes('--help')) {
  console.log('Usage: npm run seed:standalone');
  console.log('Seeds deterministic demo records into REPLOFY_SEED_WORKSPACE_ID or the first workspace.');
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const workspaceId = process.env.REPLOFY_SEED_WORKSPACE_ID;
if (workspaceId && !/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error('REPLOFY_SEED_WORKSPACE_ID must be a UUID.');
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const workspaceResult = workspaceId
    ? await client.query('select id, name from workspace where id = $1::uuid limit 1', [workspaceId])
    : await client.query('select id, name from workspace order by created_at limit 1');
  if (!workspaceResult.rows[0]) throw new Error('No workspace found. Bootstrap the instance before seeding.');
  const workspace = workspaceResult.rows[0];
  const ownerResult = await client.query(
    "select user_id from workspace_membership where workspace_id = $1::uuid order by case when role = 'owner' then 0 else 1 end, created_at limit 1",
    [workspace.id],
  );
  if (!ownerResult.rows[0]) throw new Error('Workspace has no member to own seeded records.');
  const ownerId = ownerResult.rows[0].user_id;
  const now = new Date().toISOString();
  const cycleGoalId = uuidFor(workspace.id, 'cycle-goal');
  const visionId = uuidFor(workspace.id, 'vision');
  const taskId = uuidFor(workspace.id, 'task');
  const promptId = uuidFor(workspace.id, 'prompt');
  const socialPostId = uuidFor(workspace.id, 'social-post');
  const seoKeywordId = uuidFor(workspace.id, 'seo-keyword');
  const feedbackId = uuidFor(workspace.id, 'feedback');
  const timeBlockId = uuidFor(workspace.id, 'time-block');
  const weekMarkerId = uuidFor(workspace.id, 'week-marker');
  const operatorDeskId = uuidFor(workspace.id, 'operator-desk');
  const operatorWorkOrderId = uuidFor(workspace.id, 'operator-work-order');

  await upsert(client, 'cycle_goal', {
    id: cycleGoalId,
    workspace_id: workspace.id,
    created_by_user_id: ownerId,
    title: 'Ship the portable operating core',
    description: 'Keep the self-hosted path documented, reversible, and workspace-isolated.',
    status: 'active',
    source_lineage: {},
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'vision', {
    id: visionId,
    workspace_id: workspace.id,
    created_by_user_id: ownerId,
    title: 'Owner-operated systems with visible progress',
    description: 'A local Replofy instance should make decisions, work, and evidence portable.',
    focus_items: ['Portability', 'Evidence', 'Reversible operations'],
    source_lineage: {},
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'task', {
    id: taskId,
    workspace_id: workspace.id,
    created_by_user_id: ownerId,
    title: 'Run the first restore drill',
    status: 'todo',
    effort_points: 3,
    is_lead_indicator: false,
    cycle_goal_id: cycleGoalId,
    assignee_user_id: ownerId,
    execution_notes: 'Use the documented standalone bundle and record the result.',
    source_lineage: {},
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'prompt', {
    id: promptId,
    workspace_id: workspace.id,
    title: 'Release evidence reviewer',
    version: 'v1.0',
    content: 'Review the release evidence. Name the strongest proof, the biggest gap, and the reversible next step.',
    source_lineage: {},
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'social_post', {
    id: socialPostId,
    workspace_id: workspace.id,
    platform: 'LinkedIn',
    content: 'Portable infrastructure is a product feature when recovery is part of the workflow.',
    scheduled_for: now,
    status: 'draft',
    source_lineage: {},
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'seo_keyword', {
    id: seoKeywordId,
    workspace_id: workspace.id,
    keyword: 'self-hosted operating system',
    intent: 'high',
    cycle_goal_id: cycleGoalId,
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'feedback', {
    id: feedbackId,
    workspace_id: workspace.id,
    source: 'Email',
    content: 'The recovery path should be easy to inspect before it is needed.',
    sentiment: 'positive',
    source_lineage: {},
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'time_block', {
    id: timeBlockId,
    workspace_id: workspace.id,
    title: 'Weekly evidence review',
    type: 'strategic',
    start_time: '09:00',
    end_time: '10:00',
    day_of_week: 1,
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'week_marker', {
    id: weekMarkerId,
    workspace_id: workspace.id,
    week_number: 1,
    status: 'active',
    started_at: now,
    ended_at: null,
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  }, ['workspace_id', 'week_number']);
  await upsert(client, 'operator_desk', {
    id: operatorDeskId,
    workspace_id: workspace.id,
    name: 'Release Operator',
    slug: 'release-operator',
    type: 'ops',
    mission: 'Keep release evidence, restore drills, and rollback decisions visible.',
    default_check_frequency: 'weekly',
    status: 'active',
    connected_external_agents: ['codex'],
    allowed_sources: ['tasks', 'cycle-goals', 'visions', 'prompts', 'feedbacks'],
    allowed_output_types: ['execution_task', 'risk_note'],
    approval_mode: 'action_based',
    routing_rules: {},
    dangerous_action_rules: ['deploy production', 'rollback production'],
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });
  await upsert(client, 'operator_work_order', {
    id: operatorWorkOrderId,
    workspace_id: workspace.id,
    operator_desk_id: operatorDeskId,
    title: 'Review restore evidence',
    brief: 'Run or inspect a restore drill and record the strongest proof and remaining risk.',
    status: 'ready',
    priority: 'high',
    context_pack_ids: [],
    expected_output_types: ['execution_task', 'risk_note'],
    approval_mode: 'action_based',
    claim_policy: 'single_agent',
    assigned_external_agent: null,
    claimed_by: null,
    claimed_at: null,
    available_from: now,
    due_at: null,
    created_by_user_id: ownerId,
    created_at: now,
    updated_at: now,
  });

  console.log(`[replofy-os] seeded deterministic demo records in ${workspace.name} (${workspace.id})`);
} finally {
  await client.end();
}
