import path from 'node:path';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOST: z.string().trim().min(1).default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  REPLOFY_SERVER_URL: z.string().url().default('http://localhost:4100'),
  REPLOFY_TRUSTED_ORIGINS: z.string().default('http://localhost:4100,http://localhost:4000'),
  DATABASE_URL: z.string().trim().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  REPLOFY_BOOTSTRAP_TOKEN: z.string().min(32),
  REPLOFY_DATA_DIR: z.string().trim().min(1).default('./data'),
  REPLOFY_ASSET_STORE: z.enum(['filesystem', 's3']).default('filesystem'),
  REPLOFY_S3_ENDPOINT: z.string().url().optional(),
  REPLOFY_S3_BUCKET: z.string().trim().min(1).optional(),
  REPLOFY_S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  REPLOFY_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  REPLOFY_S3_REGION: z.string().trim().min(1).default('us-east-1'),
  REPLOFY_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  REPLOFY_S3_CREATE_BUCKET: z.enum(['true', 'false']).default('false'),
  REPLOFY_SECURE_COOKIES: z.enum(['true', 'false']).optional(),
  REPLOFY_INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
});

export type ServerConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  appUrl: string;
  trustedOrigins: string[];
  databaseUrl: string;
  authSecret: string;
  bootstrapToken: string;
  dataDirectory: string;
  assetStore: 'filesystem' | 's3';
  s3?: {
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    forcePathStyle: boolean;
    createBucket: boolean;
  };
  secureCookies: boolean;
  invitationTtlHours: number;
};

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid standalone server configuration: ${details}`);
  }

  if (parsed.data.REPLOFY_ASSET_STORE === 's3') {
    const missing = [
      ['REPLOFY_S3_ENDPOINT', parsed.data.REPLOFY_S3_ENDPOINT],
      ['REPLOFY_S3_BUCKET', parsed.data.REPLOFY_S3_BUCKET],
      ['REPLOFY_S3_ACCESS_KEY_ID', parsed.data.REPLOFY_S3_ACCESS_KEY_ID],
      ['REPLOFY_S3_SECRET_ACCESS_KEY', parsed.data.REPLOFY_S3_SECRET_ACCESS_KEY],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`Invalid standalone server configuration: ${missing.join(', ')} required when REPLOFY_ASSET_STORE=s3.`);
    }
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.SERVER_HOST,
    port: parsed.data.SERVER_PORT,
    appUrl: parsed.data.REPLOFY_SERVER_URL.replace(/\/+$/, ''),
    trustedOrigins: parsed.data.REPLOFY_TRUSTED_ORIGINS
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    databaseUrl: parsed.data.DATABASE_URL,
    authSecret: parsed.data.BETTER_AUTH_SECRET,
    bootstrapToken: parsed.data.REPLOFY_BOOTSTRAP_TOKEN,
    dataDirectory: path.resolve(parsed.data.REPLOFY_DATA_DIR),
    assetStore: parsed.data.REPLOFY_ASSET_STORE,
    ...(parsed.data.REPLOFY_ASSET_STORE === 's3' && {
      s3: {
        endpoint: parsed.data.REPLOFY_S3_ENDPOINT as string,
        bucket: parsed.data.REPLOFY_S3_BUCKET as string,
        accessKeyId: parsed.data.REPLOFY_S3_ACCESS_KEY_ID as string,
        secretAccessKey: parsed.data.REPLOFY_S3_SECRET_ACCESS_KEY as string,
        region: parsed.data.REPLOFY_S3_REGION,
        forcePathStyle: parsed.data.REPLOFY_S3_FORCE_PATH_STYLE === 'true',
        createBucket: parsed.data.REPLOFY_S3_CREATE_BUCKET === 'true',
      },
    }),
    secureCookies:
      parsed.data.REPLOFY_SECURE_COOKIES !== undefined
        ? parsed.data.REPLOFY_SECURE_COOKIES === 'true'
        : parsed.data.REPLOFY_SERVER_URL.startsWith('https://'),
    invitationTtlHours: parsed.data.REPLOFY_INVITATION_TTL_HOURS,
  };
}
