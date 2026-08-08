import { createHash } from 'crypto';
import { ApiKeyServerError, getAdminFirestore } from '../src/services/apiKeyServer.ts';
import { handleExternalApiRequest } from '../src/services/externalApiServer.ts';

const runId = Date.now().toString(36);
const companyId = `creative-mcp-smoke-${runId}`;
const ownerUid = `creative-mcp-owner-${runId}`;
const keyId = `creative-mcp-key-${runId}`;
const rawKey = `ros_live_${createHash('sha256').update(runId).digest('hex')}`;
const headers = { 'x-api-key': rawKey };
const db = getAdminFirestore();
const collections = ['creativeItems', 'creativeAssets', 'contextSources', 'contextSourceVersions'];

process.env.CLOUDINARY_CLOUD_NAME ||= 'creative-mcp-smoke';
process.env.CLOUDINARY_API_KEY ||= 'creative-mcp-key';
process.env.CLOUDINARY_API_SECRET ||= 'creative-mcp-secret';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectApiError(statusCode: number, action: () => Promise<unknown>, message: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof ApiKeyServerError, `${message}: expected ApiKeyServerError`);
    assert(error.statusCode === statusCode, `${message}: expected ${statusCode}, received ${error.statusCode}`);
    return;
  }
  throw new Error(`${message}: request unexpectedly succeeded`);
}

try {
  await db.collection('users').doc(ownerUid).set({
    role: 'master-admin',
    companyId,
    email: `${ownerUid}@example.com`,
  });
  await db.collection('apiKeys').doc(keyId).set({
    keyHash: createHash('sha256').update(rawKey).digest('hex'),
    label: 'Creative MCP smoke',
    scopes: ['workspace:read', 'workspace:write', 'systems:read', 'systems:write'],
    createdAt: new Date().toISOString(),
    createdBy: ownerUid,
    ownerUid,
    companyId,
    isActive: true,
    keyLast4: rawKey.slice(-4),
    lastUsedAt: null,
    revokedAt: null,
  });

  const index = await handleExternalApiRequest(headers, 'GET', '/api/v1', {});
  const resources = (index.body as { resources: Array<{ resource: string }> }).resources.map((item) => item.resource);
  assert(resources.includes('creative-items'), 'creative-items missing from API discovery');
  assert(resources.includes('creative-assets'), 'creative-assets missing from API discovery');

  const created = await handleExternalApiRequest(headers, 'POST', '/api/v1/creative-items', {
    title: 'MCP-created idea',
    platform: 'LinkedIn',
    format: 'carousel',
    status: 'idea',
    tags: ['smoke'],
  });
  assert(created.statusCode === 201, 'creative item create failed');
  const createdId = (created.body as { data: { id: string } }).data.id;

  const updated = await handleExternalApiRequest(headers, 'PATCH', `/api/v1/creative-items/${createdId}`, {
    status: 'brief',
    brief: 'Expanded through MCP.',
  });
  assert(updated.statusCode === 200, 'creative item update failed');

  const assetId = `asset-${runId}`;
  await db.collection('creativeAssets').doc(assetId).set({
    title: 'Smoke asset',
    fileName: 'smoke.png',
    mimeType: 'image/png',
    fileSize: 10,
    assetType: 'image',
    storagePath: `creative-assets/${companyId}/${assetId}`,
    status: 'active',
    provider: 'cloudinary',
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    cloudinaryVersion: 1,
    cloudinaryFormat: 'png',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    authorId: ownerUid,
    companyId,
  });
  const assets = await handleExternalApiRequest(headers, 'GET', '/api/v1/creative-assets?status=active', {});
  assert(
    (assets.body as { data: Array<{ id: string }> }).data.some((item) => item.id === assetId),
    'creative asset metadata listing failed',
  );

  const download = await handleExternalApiRequest(
    headers,
    'GET',
    `/api/v1/creative-assets/${assetId}/download`,
    {},
  );
  const downloadBody = download.body as { assetId: string; url: string };
  assert(download.statusCode === 200, 'creative asset download action failed');
  assert(downloadBody.assetId === assetId, 'creative asset download returned the wrong asset');
  assert(downloadBody.url.includes('/image/authenticated/'), 'creative asset download did not return an authenticated Cloudinary URL');

  const archivedAssetId = `archived-${assetId}`;
  await db.collection('creativeAssets').doc(archivedAssetId).set({
    ...((await db.collection('creativeAssets').doc(assetId).get()).data() || {}),
    status: 'archived',
  });
  await expectApiError(
    409,
    () => handleExternalApiRequest(headers, 'GET', `/api/v1/creative-assets/${archivedAssetId}/download`, {}),
    'archived creative asset download',
  );

  const foreignAssetId = `foreign-${assetId}`;
  await db.collection('creativeAssets').doc(foreignAssetId).set({
    ...((await db.collection('creativeAssets').doc(assetId).get()).data() || {}),
    companyId: `foreign-${companyId}`,
  });
  await expectApiError(
    404,
    () => handleExternalApiRequest(headers, 'GET', `/api/v1/creative-assets/${foreignAssetId}/download`, {}),
    'cross-workspace creative asset download',
  );

  const ingestion = await handleExternalApiRequest(headers, 'POST', '/api/v1/context-ingestions', {
    fileName: 'creative-brief.md',
    content: '# Creative brief\nCreate a LinkedIn carousel about faster support operations.',
    mimeType: 'text/markdown',
    payload: {
      source: {
        title: 'Creative brief smoke',
        aliases: ['creative-brief'],
        summary: 'Creative Hub MCP smoke.',
      },
      items: [{
        kind: 'creative',
        title: 'Faster support operations carousel',
        summary: 'LinkedIn carousel brief.',
        creativePlatform: 'LinkedIn',
        format: 'carousel',
        status: 'idea',
        hook: 'Support teams lose time switching tools.',
        tags: ['support'],
      }],
    },
  });
  const result = (ingestion.body as { result: { linkedCreativeItemIds: string[] } }).result;
  assert(ingestion.statusCode === 201, `creative context ingestion failed: ${JSON.stringify(ingestion.body)}`);
  assert(result.linkedCreativeItemIds.length === 1, 'creative context ingestion did not link a Creative Hub item');

  console.log('Creative Hub MCP and Context Engine external API smoke test passed.');
} finally {
  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).where('companyId', '==', companyId).get();
    for (const document of snapshot.docs) await document.ref.delete();
  }
  await db.collection('apiKeys').doc(keyId).delete().catch(() => undefined);
  await db.collection('users').doc(ownerUid).delete().catch(() => undefined);
  await db.collection('creativeAssets').doc(`foreign-asset-${runId}`).delete().catch(() => undefined);
}
