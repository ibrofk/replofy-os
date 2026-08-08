import { auth } from '../firebase';
import type { CreativeAsset, CreativeAssetType } from '../types';

const CREATIVE_ASSET_ENDPOINT = '/api/internal/creative-assets';

type UploadInitResponse = {
  asset: CreativeAsset;
  upload: {
    url: string;
    method: 'POST';
    fields: Record<string, string>;
    expiresAt: string;
  };
};

type CloudinaryUploadResponse = {
  asset_id?: string;
  public_id: string;
  resource_type: string;
  type: string;
  version: number;
  format?: string;
  bytes: number;
  signature: string;
};

type UploadOptions = {
  creativeId?: string | null;
  title?: string;
  assetType?: CreativeAssetType;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  if (isRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    return value.error;
  }
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' && value.error.message.trim()) {
    return value.error.message;
  }

  return fallback;
}

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to manage creative assets.');
  }

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${CREATIVE_ASSET_ENDPOINT}${path}`, {
    ...options,
    headers: {
      ...(await getAuthHeaders()),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Creative asset request failed (${response.status})`));
  }

  return data as T;
}

export async function uploadCreativeAsset(file: File, options: UploadOptions = {}) {
  const init = await requestJson<UploadInitResponse>('/uploads', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      creativeId: options.creativeId || null,
      title: options.title || file.name.replace(/\.[^.]+$/, ''),
      assetType: options.assetType,
    }),
  });

  const uploadBody = new FormData();
  for (const [key, value] of Object.entries(init.upload.fields)) {
    uploadBody.append(key, value);
  }
  uploadBody.append('file', file);

  const uploadResponse = await fetch(init.upload.url, {
    method: init.upload.method,
    body: uploadBody,
  });
  const uploadResult = (await uploadResponse.json().catch(() => null)) as CloudinaryUploadResponse | null;
  if (!uploadResponse.ok) {
    throw new Error(getErrorMessage(uploadResult, `Asset upload failed (${uploadResponse.status}).`));
  }
  if (!uploadResult) {
    throw new Error('Asset upload did not return a Cloudinary receipt.');
  }

  const completed = await requestJson<{ asset: CreativeAsset }>(`/${encodeURIComponent(init.asset.id)}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({
      creativeId: options.creativeId || init.asset.creativeId || null,
      upload: uploadResult,
    }),
  });

  return completed.asset;
}

export async function getCreativeAssetDownloadUrl(assetId: string) {
  const result = await requestJson<{ url: string }>(`/${encodeURIComponent(assetId)}/download`, {
    method: 'GET',
  });

  return result.url;
}

export async function archiveCreativeAsset(assetId: string) {
  const result = await requestJson<{ asset: CreativeAsset }>(`/${encodeURIComponent(assetId)}/archive`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });

  return result.asset;
}
