import type { Readable } from 'node:stream';

export type StoredAsset = {
  workspaceId: string;
  objectKey: string;
  size: number;
  contentType: string;
  stream: Readable;
};

export type PutAssetInput = {
  workspaceId: string;
  objectKey: string;
  contentType: string;
  size: number;
  body: Readable;
};

export type AssetStoreProvider = 'filesystem' | 's3';

export interface AssetStore {
  readonly provider: AssetStoreProvider;
  put(input: PutAssetInput): Promise<{ size: number }>;
  get(workspaceId: string, objectKey: string): Promise<StoredAsset | null>;
  delete(workspaceId: string, objectKey: string): Promise<boolean>;
}
