import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import type { ServerConfig } from './config.js';
import type { PostgresDatabase } from './db/client.js';
import { authSchema } from './db/schema.js';

export function createLocalAuth(config: ServerConfig, database: PostgresDatabase) {
  return betterAuth({
    appName: 'Replofy OS',
    baseURL: config.appUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        activeWorkspaceId: {
          type: 'string',
          required: false,
          input: false,
        },
      },
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      cookiePrefix: 'replofy',
      useSecureCookies: config.secureCookies,
    },
    trustedOrigins: [...new Set([config.appUrl, ...config.trustedOrigins])],
  });
}

export type LocalAuth = ReturnType<typeof createLocalAuth>;
