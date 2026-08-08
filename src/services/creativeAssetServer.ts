import { timingSafeEqual } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import {
  ApiKeyServerError,
  authorizeFirebaseUserFromHeaders,
  getAdminFirestore,
  type FirebaseRequestActor,
} from './apiKeyServer.js';
import type { CreativeAsset, CreativeAssetResourceType, CreativeAssetType } from '../types.js';

type HeaderBag = Record<string, string | string[] | undefined> | undefined;

type InternalApiResponse = {
  statusCode: number;
  body: unknown;
};

type LinkedDoc = Record<string, unknown> & {
  id: string;
};

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

const CREATIVE_ASSET_TYPES = ['image', 'video', 'document', 'source', 'other'] as const;
const CLOUDINARY_RESOURCE_TYPES = ['image', 'video', 'raw'] as const;
const MAX_CREATIVE_ASSET_BYTES = 250 * 1024 * 1024;
const CLOUDINARY_UPLOAD_SIGNATURE_TTL_MS = 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectObject(value: unknown) {
  if (!isRecord(value)) {
    throw new ApiKeyServerError('Request body must be a JSON object.', 400);
  }

  return value;
}

function optionalString(input: Record<string, unknown>, key: string, max: number) {
  if (!(key in input)) return undefined;
  const value = input[key];
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiKeyServerError(`${key} must be a string.`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new ApiKeyServerError(`${key} must be ${max} characters or fewer.`, 400);
  }
  return normalized;
}

function requireString(input: Record<string, unknown>, key: string, max: number) {
  const value = optionalString(input, key, max);
  if (!value) {
    throw new ApiKeyServerError(`${key} is required.`, 400);
  }
  return value;
}

function requirePositiveInteger(input: Record<string, unknown>, key: string, max: number) {
  const value = input[key];
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > max) {
    throw new ApiKeyServerError(`${key} must be between 1 and ${max}.`, 400);
  }

  return value as number;
}

function requireFileSize(input: Record<string, unknown>) {
  const value = input.fileSize;
  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > MAX_CREATIVE_ASSET_BYTES) {
    throw new ApiKeyServerError('fileSize must be between 1 byte and 250 MB.', 400);
  }

  return value as number;
}

function inferAssetType(mimeType: string): CreativeAssetType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

function normalizeAssetType(input: Record<string, unknown>, mimeType: string): CreativeAssetType {
  const value = optionalString(input, 'assetType', 40);
  if (!value) return inferAssetType(mimeType);
  if (!CREATIVE_ASSET_TYPES.includes(value as CreativeAssetType)) {
    throw new ApiKeyServerError('assetType is invalid.', 400);
  }
  return value as CreativeAssetType;
}

function inferCloudinaryResourceType(assetType: CreativeAssetType): CreativeAssetResourceType {
  if (assetType === 'image') return 'image';
  if (assetType === 'video') return 'video';
  return 'raw';
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'creative-asset';
}

function sanitizePublicIdFileName(fileName: string, resourceType: CreativeAssetResourceType) {
  const normalized = sanitizePathSegment(fileName);
  if (resourceType === 'raw') return normalized;
  return normalized.replace(/\.[^.]+$/, '') || 'creative-asset';
}

function canAccessDoc(actor: FirebaseRequestActor, data: Record<string, unknown>) {
  const companyId = typeof data.companyId === 'string' ? data.companyId : null;
  const authorId = typeof data.authorId === 'string' ? data.authorId : '';
  return (companyId && actor.companyId === companyId) || authorId === actor.uid;
}

function getCloudinaryConfig(): CloudinaryConfig {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  let apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  let apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
  if ((!cloudName || !apiKey || !apiSecret) && cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      if (parsed.protocol === 'cloudinary:') {
        cloudName = decodeURIComponent(parsed.hostname);
        apiKey = decodeURIComponent(parsed.username);
        apiSecret = decodeURIComponent(parsed.password);
      }
    } catch {
      // The generic configuration error below keeps credential details out of logs.
    }
  }

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  } else {
    cloudinary.config({ secure: true });
  }

  const config = cloudinary.config();
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new ApiKeyServerError(
      'Creative asset storage is unavailable until Cloudinary credentials are configured.',
      503,
    );
  }

  return {
    cloudName: config.cloud_name,
    apiKey: config.api_key,
    apiSecret: config.api_secret,
  };
}

async function requireCreativeAccess(actor: FirebaseRequestActor, creativeId: string) {
  const snapshot = await getAdminFirestore().collection('creativeItems').doc(creativeId).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Creative not found.', 404);
  }

  const data = snapshot.data() || {};
  if (!canAccessDoc(actor, data)) {
    throw new ApiKeyServerError('Creative not found.', 404);
  }

  return {
    id: snapshot.id,
    ...data,
  } as LinkedDoc;
}

async function requireAssetAccess(actor: FirebaseRequestActor, assetId: string) {
  const snapshot = await getAdminFirestore().collection('creativeAssets').doc(assetId).get();
  if (!snapshot.exists) {
    throw new ApiKeyServerError('Creative asset not found.', 404);
  }

  const data = snapshot.data() || {};
  if (!canAccessDoc(actor, data)) {
    throw new ApiKeyServerError('Creative asset not found.', 404);
  }

  return {
    ref: snapshot.ref,
    data: {
      id: snapshot.id,
      ...data,
    } as CreativeAsset,
  };
}

function buildCloudinaryPublicId(
  actor: FirebaseRequestActor,
  assetId: string,
  fileName: string,
  resourceType: CreativeAssetResourceType,
) {
  const scope = actor.companyId
    ? `companies/${sanitizePathSegment(actor.companyId)}`
    : `users/${sanitizePathSegment(actor.uid)}`;
  return `creative-assets/${scope}/${assetId}/${sanitizePublicIdFileName(fileName, resourceType)}`;
}

async function createUpload(actor: FirebaseRequestActor, body: unknown) {
  const input = expectObject(body);
  const fileName = requireString(input, 'fileName', 220);
  const mimeType = requireString(input, 'mimeType', 160);
  const fileSize = requireFileSize(input);
  const title = optionalString(input, 'title', 160) || fileName.replace(/\.[^.]+$/, '');
  const creativeId = optionalString(input, 'creativeId', 200);

  if (creativeId) {
    await requireCreativeAccess(actor, creativeId);
  }

  const config = getCloudinaryConfig();
  const assetType = normalizeAssetType(input, mimeType);
  const cloudinaryResourceType = inferCloudinaryResourceType(assetType);
  const ref = getAdminFirestore().collection('creativeAssets').doc();
  const storagePath = buildCloudinaryPublicId(actor, ref.id, fileName, cloudinaryResourceType);
  const now = nowIso();
  const asset: CreativeAsset = {
    id: ref.id,
    creativeId: creativeId || null,
    title,
    fileName,
    mimeType,
    fileSize,
    assetType,
    storagePath,
    provider: 'cloudinary',
    cloudinaryAssetId: null,
    cloudinaryResourceType,
    cloudinaryDeliveryType: 'authenticated',
    cloudinaryVersion: null,
    cloudinaryFormat: null,
    status: 'uploading',
    uploadedAt: null,
    createdAt: now,
    updatedAt: now,
    authorId: actor.uid,
    companyId: actor.companyId,
  };

  const timestamp = Math.floor(Date.now() / 1000);
  const fields = {
    api_key: config.apiKey,
    public_id: storagePath,
    timestamp: String(timestamp),
    type: 'authenticated',
  };
  const signature = cloudinary.utils.api_sign_request(
    {
      public_id: fields.public_id,
      timestamp: fields.timestamp,
      type: fields.type,
    },
    config.apiSecret,
  );

  await ref.set({ ...asset });

  return {
    statusCode: 201,
    body: {
      asset,
      upload: {
        url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/${cloudinaryResourceType}/upload`,
        method: 'POST',
        fields: {
          ...fields,
          signature,
        },
        expiresAt: new Date(timestamp * 1000 + CLOUDINARY_UPLOAD_SIGNATURE_TTL_MS).toISOString(),
      },
    },
  } satisfies InternalApiResponse;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function attachAssetToCreative(creativeId: string, assetId: string) {
  const ref = getAdminFirestore().collection('creativeItems').doc(creativeId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;

  const data = snapshot.data() || {};
  const assetIds = Array.isArray(data.assetIds) ? data.assetIds.filter((value): value is string => typeof value === 'string') : [];
  await ref.update({
    assetIds: uniq([...assetIds, assetId]),
    updatedAt: nowIso(),
  });
}

async function detachAssetFromCreative(creativeId: string, assetId: string) {
  const ref = getAdminFirestore().collection('creativeItems').doc(creativeId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;

  const data = snapshot.data() || {};
  const assetIds = Array.isArray(data.assetIds) ? data.assetIds.filter((value): value is string => typeof value === 'string') : [];
  await ref.update({
    assetIds: assetIds.filter((id) => id !== assetId),
    updatedAt: nowIso(),
  });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateCloudinaryUpload(data: CreativeAsset, input: Record<string, unknown>) {
  const config = getCloudinaryConfig();
  const upload = expectObject(input.upload);
  const publicId = requireString(upload, 'public_id', 500);
  const resourceType = requireString(upload, 'resource_type', 20);
  const deliveryType = requireString(upload, 'type', 40);
  const signature = requireString(upload, 'signature', 160);
  const version = requirePositiveInteger(upload, 'version', Number.MAX_SAFE_INTEGER);
  const bytes = requirePositiveInteger(upload, 'bytes', MAX_CREATIVE_ASSET_BYTES);
  const assetId = optionalString(upload, 'asset_id', 200) || null;
  const format = optionalString(upload, 'format', 80) || null;

  if (data.provider !== 'cloudinary') {
    throw new ApiKeyServerError('Creative asset upload provider is invalid.', 409);
  }
  if (publicId !== data.storagePath) {
    throw new ApiKeyServerError('Cloudinary upload does not match this creative asset.', 422);
  }
  if (!CLOUDINARY_RESOURCE_TYPES.includes(resourceType as CreativeAssetResourceType)) {
    throw new ApiKeyServerError('Cloudinary upload resource type is invalid.', 422);
  }
  if (resourceType !== data.cloudinaryResourceType || deliveryType !== 'authenticated') {
    throw new ApiKeyServerError('Cloudinary upload settings do not match this creative asset.', 422);
  }

  const expectedSignature = cloudinary.utils.api_sign_request(
    {
      public_id: publicId,
      version: String(version),
    },
    config.apiSecret,
  );
  if (!safeEqual(signature, expectedSignature)) {
    throw new ApiKeyServerError('Cloudinary upload signature is invalid.', 422);
  }

  return {
    assetId,
    bytes,
    deliveryType: 'authenticated' as const,
    format,
    publicId,
    resourceType: resourceType as CreativeAssetResourceType,
    version,
  };
}

async function completeUpload(actor: FirebaseRequestActor, assetId: string, body: unknown) {
  const input = expectObject(body);
  const { ref, data } = await requireAssetAccess(actor, assetId);
  const creativeId = optionalString(input, 'creativeId', 200) ?? data.creativeId ?? null;

  if (creativeId) {
    await requireCreativeAccess(actor, creativeId);
  }

  const upload = validateCloudinaryUpload(data, input);
  const now = nowIso();
  await ref.update({
    creativeId,
    fileSize: upload.bytes,
    status: 'active',
    uploadedAt: now,
    updatedAt: now,
    cloudinaryAssetId: upload.assetId,
    cloudinaryResourceType: upload.resourceType,
    cloudinaryDeliveryType: upload.deliveryType,
    cloudinaryVersion: upload.version,
    cloudinaryFormat: upload.format,
  });

  if (creativeId) {
    await attachAssetToCreative(creativeId, assetId);
  }

  return {
    statusCode: 200,
    body: {
      asset: {
        ...data,
        creativeId,
        fileSize: upload.bytes,
        status: 'active',
        uploadedAt: now,
        updatedAt: now,
        cloudinaryAssetId: upload.assetId,
        cloudinaryResourceType: upload.resourceType,
        cloudinaryDeliveryType: upload.deliveryType,
        cloudinaryVersion: upload.version,
        cloudinaryFormat: upload.format,
      },
    },
  } satisfies InternalApiResponse;
}

export function createCloudinaryDeliveryUrl(data: CreativeAsset) {
  getCloudinaryConfig();
  if (data.provider !== 'cloudinary' || !data.cloudinaryResourceType) {
    throw new ApiKeyServerError('This creative asset does not have an active Cloudinary file.', 409);
  }

  return cloudinary.url(data.storagePath, {
    secure: true,
    sign_url: true,
    type: data.cloudinaryDeliveryType || 'authenticated',
    resource_type: data.cloudinaryResourceType,
    version: data.cloudinaryVersion || undefined,
    format: data.cloudinaryResourceType === 'raw' ? undefined : data.cloudinaryFormat || undefined,
  });
}

async function createDownloadUrl(actor: FirebaseRequestActor, assetId: string) {
  const { data } = await requireAssetAccess(actor, assetId);
  if (data.status !== 'active') {
    throw new ApiKeyServerError('Creative asset is not available for download.', 409);
  }

  return {
    statusCode: 200,
    body: {
      url: createCloudinaryDeliveryUrl(data),
    },
  } satisfies InternalApiResponse;
}

async function archiveAsset(actor: FirebaseRequestActor, assetId: string) {
  const { ref, data } = await requireAssetAccess(actor, assetId);

  if (data.provider === 'cloudinary' && data.cloudinaryResourceType) {
    getCloudinaryConfig();
    await cloudinary.uploader.destroy(data.storagePath, {
      resource_type: data.cloudinaryResourceType,
      type: data.cloudinaryDeliveryType || 'authenticated',
      invalidate: true,
    });
  }

  const now = nowIso();
  await ref.update({
    status: 'archived',
    updatedAt: now,
  });

  if (data.creativeId) {
    await detachAssetFromCreative(data.creativeId, assetId);
  }

  return {
    statusCode: 200,
    body: {
      asset: {
        ...data,
        status: 'archived',
        updatedAt: now,
      },
    },
  } satisfies InternalApiResponse;
}

export async function handleCreativeAssetRequest(
  headers: HeaderBag,
  method: string | undefined,
  requestUrl: string | undefined,
  body: unknown,
): Promise<InternalApiResponse> {
  const actor = await authorizeFirebaseUserFromHeaders(headers);
  const normalizedMethod = method?.toUpperCase() || 'GET';
  const url = new URL(requestUrl || '/api/internal/creative-assets', 'http://localhost');
  const path = url.pathname.replace(/^\/api\/internal\/?/, '');
  const segments = path ? path.split('/').filter(Boolean) : [];

  if (segments[0] !== 'creative-assets') {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  if (segments[1] === 'uploads') {
    if (normalizedMethod !== 'POST') {
      throw new ApiKeyServerError('Method not allowed.', 405);
    }
    return createUpload(actor, body);
  }

  const assetId = segments[1];
  const action = segments[2];

  if (!assetId || !action || segments.length > 3) {
    throw new ApiKeyServerError('Resource not found.', 404);
  }

  if (action === 'complete' && normalizedMethod === 'PATCH') {
    return completeUpload(actor, assetId, body);
  }

  if (action === 'download' && normalizedMethod === 'GET') {
    return createDownloadUrl(actor, assetId);
  }

  if (action === 'archive' && normalizedMethod === 'PATCH') {
    return archiveAsset(actor, assetId);
  }

  throw new ApiKeyServerError('Method not allowed.', 405);
}
