import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { AssetStore, PutAssetInput, StoredAsset } from './asset-store.js';

const EMPTY_PAYLOAD_SHA256 = createHash('sha256').update('').digest('hex');
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type FetchLike = (
  input: string | URL,
  init?: RequestInit & { duplex?: 'half' },
) => Promise<Response>;

export type S3AssetStoreOptions = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  forcePathStyle?: boolean;
  createBucket?: boolean;
  fetch?: FetchLike;
  now?: () => Date;
};

function hmac(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function encodeSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function validateSegment(label: string, value: string) {
  if (!SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${label} contains unsupported path characters.`);
  }
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatShortDate(date: Date) {
  return formatAmzDate(date).slice(0, 8);
}

function canonicalUri(url: URL) {
  return (url.pathname || '/')
    .split('/')
    .map((segment) => encodeSegment(decodeURIComponent(segment)))
    .join('/');
}

function normalizeHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function responseError(response: Response, operation: string) {
  return response.text().catch(() => '').then((details) => {
    const suffix = details.trim() ? `: ${details.trim().slice(0, 500)}` : '';
    return new Error(`S3 ${operation} failed with HTTP ${response.status}${suffix}`);
  });
}

export class S3AssetStore implements AssetStore {
  readonly provider = 's3' as const;
  private readonly endpointUrl: URL;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;
  private readonly forcePathStyle: boolean;
  private readonly createBucket: boolean;
  private readonly fetcher: FetchLike;
  private readonly now: () => Date;
  private bucketReady = false;
  private bucketPromise: Promise<void> | undefined;

  constructor(options: S3AssetStoreOptions) {
    this.endpointUrl = new URL(options.endpoint);
    if (this.endpointUrl.protocol !== 'http:' && this.endpointUrl.protocol !== 'https:') {
      throw new Error('S3 endpoint must use http:// or https://.');
    }
    if (this.endpointUrl.search || this.endpointUrl.hash) {
      throw new Error('S3 endpoint must not include a query string or hash.');
    }
    validateSegment('S3 bucket', options.bucket);
    if (!options.accessKeyId.trim() || !options.secretAccessKey) {
      throw new Error('S3 access key and secret are required.');
    }
    this.bucket = options.bucket;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.region = options.region?.trim() || 'us-east-1';
    this.forcePathStyle = options.forcePathStyle ?? true;
    this.createBucket = options.createBucket ?? false;
    this.fetcher = options.fetch || fetch;
    this.now = options.now || (() => new Date());
  }

  private urlFor(workspaceId?: string, objectKey?: string) {
    const url = new URL(this.endpointUrl.toString());
    const prefix = url.pathname.replace(/\/+$/, '');
    const segments = this.forcePathStyle
      ? [this.bucket, ...(workspaceId && objectKey ? [workspaceId, objectKey] : [])]
      : workspaceId && objectKey
        ? [workspaceId, objectKey]
        : [];
    if (!this.forcePathStyle) url.hostname = `${this.bucket}.${url.hostname}`;
    const encodedSegments = segments.map(encodeSegment).join('/');
    url.pathname = `${prefix}/${encodedSegments}` || '/';
    return url;
  }

  private sign(method: string, url: URL, headers: Record<string, string>, payloadHash: string) {
    const now = this.now();
    const amzDate = formatAmzDate(now);
    const shortDate = formatShortDate(now);
    const signedHeaders = {
      host: url.host,
      ...headers,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const normalizedHeaders = Object.entries(signedHeaders)
      .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    const canonicalHeaders = normalizedHeaders.map(([name, value]) => `${name}:${value}\n`).join('');
    const signedHeaderNames = normalizedHeaders.map(([name]) => name).join(';');
    const canonicalRequest = [
      method,
      canonicalUri(url),
      '',
      canonicalHeaders,
      signedHeaderNames,
      payloadHash,
    ].join('\n');
    const credentialScope = `${shortDate}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, shortDate), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return {
      ...headers,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    };
  }

  private async request(
    method: string,
    url: URL,
    options: { headers?: Record<string, string>; body?: Readable; payloadHash?: string } = {},
  ) {
    const payloadHash = options.payloadHash || (options.body ? UNSIGNED_PAYLOAD : EMPTY_PAYLOAD_SHA256);
    const headers = this.sign(method, url, options.headers || {}, payloadHash);
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
    };
    if (options.body) {
      init.body = options.body as unknown as BodyInit;
      init.duplex = 'half';
    }
    return this.fetcher(url, init);
  }

  private async ensureBucket() {
    if (!this.createBucket || this.bucketReady) return;
    if (!this.bucketPromise) {
      this.bucketPromise = (async () => {
        const response = await this.request('HEAD', this.urlFor());
        if (response.ok || response.status === 301 || response.status === 307) {
          this.bucketReady = true;
          return;
        }
        if (response.status !== 404) throw await responseError(response, 'bucket check');
        const created = await this.request('PUT', this.urlFor());
        if (!created.ok && created.status !== 409) throw await responseError(created, 'bucket creation');
        this.bucketReady = true;
      })().catch((error) => {
        this.bucketPromise = undefined;
        throw error;
      });
    }
    await this.bucketPromise;
  }

  private objectUrl(workspaceId: string, objectKey: string) {
    validateSegment('workspaceId', workspaceId);
    validateSegment('objectKey', objectKey);
    return this.urlFor(workspaceId, objectKey);
  }

  async put(input: PutAssetInput) {
    const url = this.objectUrl(input.workspaceId, input.objectKey);
    await this.ensureBucket();
    let size = 0;
    input.body.on('data', (chunk: Buffer | string) => {
      size += Buffer.byteLength(chunk);
    });
    const response = await this.request('PUT', url, {
      headers: {
        'content-type': input.contentType,
        'content-length': String(input.size),
      },
      body: input.body,
    });
    if (!response.ok) throw await responseError(response, 'asset upload');
    return { size };
  }

  async get(workspaceId: string, objectKey: string): Promise<StoredAsset | null> {
    const response = await this.request('GET', this.objectUrl(workspaceId, objectKey));
    if (response.status === 404) return null;
    if (!response.ok) throw await responseError(response, 'asset download');
    const contentLength = Number(response.headers.get('content-length'));
    const stream = response.body
      ? Readable.fromWeb(response.body as unknown as NodeReadableStream)
      : Readable.from([]);
    return {
      workspaceId,
      objectKey,
      size: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : 0,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      stream,
    };
  }

  async delete(workspaceId: string, objectKey: string) {
    const response = await this.request('DELETE', this.objectUrl(workspaceId, objectKey));
    if (response.status === 404) return false;
    if (!response.ok) throw await responseError(response, 'asset deletion');
    return true;
  }
}
