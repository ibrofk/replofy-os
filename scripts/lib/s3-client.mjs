import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

const EMPTY_PAYLOAD_SHA256 = createHash('sha256').update('').digest('hex');
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function encodeSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/%20/g, '%20');
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function canonicalUri(url) {
  return (url.pathname || '/')
    .split('/')
    .map((segment) => encodeSegment(decodeURIComponent(segment)))
    .join('/');
}

function canonicalQuery(url) {
  return [...url.searchParams.entries()]
    .map(([name, value]) => [encodeQuery(name), encodeQuery(value)])
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue),
    )
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function normalizeHeaderValue(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function validateKey(key) {
  if (typeof key !== 'string' || !key || key.startsWith('/') || key.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`S3 object key is unsafe: ${key}`);
  }
  return key.split('/');
}

async function errorFor(response, operation) {
  const details = await response.text().catch(() => '');
  const suffix = details.trim() ? `: ${details.trim().slice(0, 500)}` : '';
  return new Error(`S3 ${operation} failed with HTTP ${response.status}${suffix}`);
}

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

export function createS3Client(options) {
  const endpointUrl = new URL(options.endpoint);
  if (!['http:', 'https:'].includes(endpointUrl.protocol)) throw new Error('S3 endpoint must use http:// or https://.');
  if (endpointUrl.search || endpointUrl.hash) throw new Error('S3 endpoint must not include a query string or hash.');
  if (!SAFE_SEGMENT.test(options.bucket) || options.bucket === '.' || options.bucket === '..') {
    throw new Error('S3 bucket contains unsupported path characters.');
  }
  if (!options.accessKeyId?.trim() || !options.secretAccessKey) throw new Error('S3 access key and secret are required.');
  const region = options.region?.trim() || 'us-east-1';
  const forcePathStyle = options.forcePathStyle ?? true;
  const fetcher = options.fetch || fetch;
  const now = options.now || (() => new Date());

  function urlFor(key) {
    const url = new URL(endpointUrl.toString());
    const prefix = url.pathname.replace(/\/+$/, '');
    const segments = key === undefined
      ? (forcePathStyle ? [options.bucket] : [])
      : (forcePathStyle ? [options.bucket, ...validateKey(key)] : validateKey(key));
    if (!forcePathStyle) url.hostname = `${options.bucket}.${url.hostname}`;
    url.pathname = `${prefix}/${segments.map(encodeSegment).join('/')}` || '/';
    return url;
  }

  function sign(method, url, headers, payloadHash) {
    const current = now();
    const amzDate = formatAmzDate(current);
    const shortDate = amzDate.slice(0, 8);
    const signedHeaders = {
      host: url.host,
      ...headers,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const normalized = Object.entries(signedHeaders)
      .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)]);
    normalized.sort(([left], [right]) => left.localeCompare(right));
    const canonicalHeaders = normalized.map(([name, value]) => `${name}:${value}\n`).join('');
    const signedHeaderNames = normalized.map(([name]) => name).join(';');
    const canonicalRequest = [
      method,
      canonicalUri(url),
      canonicalQuery(url),
      canonicalHeaders,
      signedHeaderNames,
      payloadHash,
    ].join('\n');
    const scope = `${shortDate}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, shortDate), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return {
      ...headers,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    };
  }

  async function request(method, url, { headers = {}, body, payloadHash } = {}) {
    const contentHash = payloadHash || (body ? UNSIGNED_PAYLOAD : EMPTY_PAYLOAD_SHA256);
    const init = { method, headers: sign(method, url, headers, contentHash) };
    if (body) {
      init.body = body;
      init.duplex = 'half';
    }
    return fetcher(url, init);
  }

  return {
    async ensureBucket() {
      const response = await request('HEAD', urlFor());
      if (response.ok || response.status === 301 || response.status === 307) return;
      if (response.status !== 404) throw await errorFor(response, 'bucket check');
      const created = await request('PUT', urlFor());
      if (!created.ok && created.status !== 409) throw await errorFor(created, 'bucket creation');
    },

    async listObjects(prefix = '') {
      const objects = [];
      let continuationToken;
      do {
        const url = urlFor();
        url.searchParams.set('list-type', '2');
        url.searchParams.set('max-keys', '1000');
        if (prefix) url.searchParams.set('prefix', prefix);
        if (continuationToken) url.searchParams.set('continuation-token', continuationToken);
        const response = await request('GET', url);
        if (!response.ok) throw await errorFor(response, 'object listing');
        const xml = await response.text();
        for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const block = match[1];
          const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
          const size = block.match(/<Size>(\d+)<\/Size>/)?.[1];
          if (key && size) objects.push({ key: decodeXml(key), size: Number(size) });
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
        continuationToken = truncated && next ? decodeXml(next) : undefined;
      } while (continuationToken);
      return objects;
    },

    async headObject(key) {
      const response = await request('HEAD', urlFor(key));
      if (response.status === 404) return null;
      if (!response.ok) throw await errorFor(response, 'object metadata');
      const contentLength = Number(response.headers.get('content-length'));
      return {
        size: Number.isSafeInteger(contentLength) && contentLength >= 0 ? contentLength : undefined,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      };
    },

    async getObject(key) {
      const response = await request('GET', urlFor(key));
      if (response.status === 404) return null;
      if (!response.ok) throw await errorFor(response, 'object download');
      return {
        body: response.body ? Readable.fromWeb(response.body) : Readable.from([]),
        size: Number(response.headers.get('content-length')),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      };
    },

    async putObject(key, body, contentType) {
      const response = await request('PUT', urlFor(key), {
        headers: { 'content-type': contentType || 'application/octet-stream' },
        body,
      });
      if (!response.ok) throw await errorFor(response, 'object upload');
    },

    async deleteObject(key) {
      const response = await request('DELETE', urlFor(key));
      if (response.status === 404) return false;
      if (!response.ok) throw await errorFor(response, 'object deletion');
      return true;
    },
  };
}

export function s3OptionsFromEnvironment(environment = process.env) {
  const missing = [
    ['REPLOFY_S3_ENDPOINT', environment.REPLOFY_S3_ENDPOINT],
    ['REPLOFY_S3_BUCKET', environment.REPLOFY_S3_BUCKET],
    ['REPLOFY_S3_ACCESS_KEY_ID', environment.REPLOFY_S3_ACCESS_KEY_ID],
    ['REPLOFY_S3_SECRET_ACCESS_KEY', environment.REPLOFY_S3_SECRET_ACCESS_KEY],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`${missing.join(', ')} required for S3 backup/restore.`);
  return {
    endpoint: environment.REPLOFY_S3_ENDPOINT,
    bucket: environment.REPLOFY_S3_BUCKET,
    accessKeyId: environment.REPLOFY_S3_ACCESS_KEY_ID,
    secretAccessKey: environment.REPLOFY_S3_SECRET_ACCESS_KEY,
    region: environment.REPLOFY_S3_REGION || 'us-east-1',
    forcePathStyle: environment.REPLOFY_S3_FORCE_PATH_STYLE !== 'false',
  };
}
