import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { AssetStore, PutAssetInput, StoredAsset } from './asset-store.js';

type AssetMetadata = {
  contentType: string;
};

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validateSegment(label: string, value: string) {
  if (!SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${label} contains unsupported path characters.`);
  }
}

export class FilesystemAssetStore implements AssetStore {
  readonly provider = 'filesystem' as const;
  readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
  }

  private paths(workspaceId: string, objectKey: string) {
    validateSegment('workspaceId', workspaceId);
    validateSegment('objectKey', objectKey);

    const workspaceDirectory = path.join(this.rootDirectory, workspaceId);
    return {
      workspaceDirectory,
      contentPath: path.join(workspaceDirectory, objectKey),
      metadataPath: path.join(workspaceDirectory, `${objectKey}.metadata.json`),
    };
  }

  async put(input: PutAssetInput) {
    const paths = this.paths(input.workspaceId, input.objectKey);
    await mkdir(paths.workspaceDirectory, { recursive: true });

    const temporaryId = randomUUID();
    const temporaryContentPath = path.join(paths.workspaceDirectory, `.${temporaryId}.upload`);
    const temporaryMetadataPath = path.join(paths.workspaceDirectory, `.${temporaryId}.metadata`);
    let size = 0;

    input.body.on('data', (chunk: Buffer | string) => {
      size += Buffer.byteLength(chunk);
    });

    try {
      await pipeline(input.body, createWriteStream(temporaryContentPath, { flags: 'wx' }));
      const metadataHandle = await open(temporaryMetadataPath, 'wx');
      await metadataHandle.writeFile(JSON.stringify({ contentType: input.contentType } satisfies AssetMetadata));
      await metadataHandle.close();
      await rename(temporaryContentPath, paths.contentPath);
      await rename(temporaryMetadataPath, paths.metadataPath);
      return { size };
    } catch (error) {
      await Promise.all([
        rm(temporaryContentPath, { force: true }),
        rm(temporaryMetadataPath, { force: true }),
      ]);
      throw error;
    }
  }

  async get(workspaceId: string, objectKey: string): Promise<StoredAsset | null> {
    const paths = this.paths(workspaceId, objectKey);

    try {
      const [details, metadataText] = await Promise.all([
        stat(paths.contentPath),
        readFile(paths.metadataPath, 'utf8'),
      ]);
      const metadata = JSON.parse(metadataText) as AssetMetadata;
      if (!metadata.contentType || typeof metadata.contentType !== 'string') {
        throw new Error('Asset metadata is invalid.');
      }

      return {
        workspaceId,
        objectKey,
        size: details.size,
        contentType: metadata.contentType,
        stream: createReadStream(paths.contentPath),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(workspaceId: string, objectKey: string) {
    const paths = this.paths(workspaceId, objectKey);
    const existing = await this.get(workspaceId, objectKey);
    if (!existing) return false;
    existing.stream.destroy();

    await Promise.all([
      rm(paths.contentPath, { force: true }),
      rm(paths.metadataPath, { force: true }),
    ]);
    return true;
  }
}
