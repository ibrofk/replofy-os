import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function hydrateServerEnv(env: Record<string, string | undefined>, mode: string) {
  const serverEnvKeys = [
    'GEMINI_API_KEY',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_DATABASE_ID',
    'FIRESTORE_DATABASE_ID',
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
    'CLOUDINARY_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'REPLOFY_CHATGPT_APP_AUTH_MODE',
    'REPLOFY_CHATGPT_APP_BASE_URL',
    'REPLOFY_CHATGPT_APP_WIDGET_DOMAIN',
    'REPLOFY_CHATGPT_APP_API_KEY',
  ];

  for (const key of serverEnvKeys) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key];
    }
  }

  if (mode !== 'production' && !process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081';
  }

  if (mode !== 'production' && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  if (env.VITE_REPLOFY_PLATFORM && !['firebase', 'standalone'].includes(env.VITE_REPLOFY_PLATFORM)) {
    throw new Error('VITE_REPLOFY_PLATFORM must be "firebase" or "standalone".');
  }
  const standalonePlatform = env.VITE_REPLOFY_PLATFORM === 'standalone';
  hydrateServerEnv(env, mode);

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'replofy-gemini-dev-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (
              standalonePlatform &&
              (req.url?.startsWith('/api/auth') ||
                req.url?.startsWith('/api/setup') ||
                req.url?.startsWith('/api/invitations') ||
                req.url?.startsWith('/api/workspaces') ||
                req.url?.startsWith('/api/v1'))
            ) {
              next();
              return;
            }
            if (
              !req.url?.startsWith('/.well-known/oauth-') &&
              !req.url?.startsWith('/.well-known/openid-configuration') &&
              !req.url?.startsWith('/api/oauth') &&
              !req.url?.startsWith('/mcp') &&
              !req.url?.startsWith('/api/gemini') &&
              !req.url?.startsWith('/api/api-keys') &&
              !req.url?.startsWith('/api/internal') &&
              !req.url?.startsWith('/api/v1')
            ) {
              next();
              return;
            }

            try {
              if (req.url?.startsWith('/.well-known/openid-configuration')) {
                sendJson(res as ServerResponse, 404, {
                  error: 'not_found',
                  error_description: 'This Replofy OS connector supports OAuth 2.1, not OpenID Connect.',
                });
                return;
              }

              if (req.url?.startsWith('/.well-known/oauth-')) {
                const oauthServer = await import('./src/services/chatgptApp/oauthServer');
                if (req.method !== 'GET') {
                  res.setHeader('Allow', 'GET');
                  sendJson(res as ServerResponse, 405, { error: 'Method not allowed' });
                  return;
                }
                if (req.url.startsWith('/.well-known/oauth-protected-resource')) {
                  sendJson(res as ServerResponse, 200, oauthServer.getProtectedResourceMetadata(req.headers));
                  return;
                }
                sendJson(res as ServerResponse, 200, oauthServer.getAuthorizationServerMetadata(req.headers));
                return;
              }

              if (req.url?.startsWith('/api/oauth')) {
                const oauthServer = await import('./src/services/chatgptApp/oauthServer');
                if (req.method !== 'POST') {
                  res.setHeader('Allow', 'POST');
                  sendJson(res as ServerResponse, 405, { error: 'Method not allowed' });
                  return;
                }

                const bodyText = await readBody(req);
                const contentType = req.headers['content-type'];
                const body =
                  typeof contentType === 'string' && contentType.includes('application/x-www-form-urlencoded')
                    ? Object.fromEntries(new URLSearchParams(bodyText))
                    : bodyText
                      ? JSON.parse(bodyText)
                      : {};

                if (req.url.startsWith('/api/oauth/register')) {
                  sendJson(res as ServerResponse, 201, await oauthServer.registerOAuthClient(body));
                  return;
                }
                if (req.url.startsWith('/api/oauth/token')) {
                  sendJson(res as ServerResponse, 200, await oauthServer.handleOAuthTokenRequest(req.headers, body));
                  return;
                }
                if (req.url.startsWith('/api/oauth/authorize/complete')) {
                  sendJson(res as ServerResponse, 200, await oauthServer.completeOAuthAuthorization(req.headers, body));
                  return;
                }
              }

              if (req.url?.startsWith('/mcp')) {
                const mcpServer = await import('./src/services/chatgptApp/mcpServer');

                const bodyText =
                  req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
                    ? ''
                    : await readBody(req);
                const body = bodyText ? JSON.parse(bodyText) : undefined;

                await mcpServer.handleReplofyMcpRequest(req, res as ServerResponse, body);
                return;
              }

              if (req.url?.startsWith('/api/v1')) {
                const externalApiServer = await import('./src/services/externalApiServer');

                if (req.method === 'OPTIONS') {
                  res.setHeader('Allow', 'GET, POST, PATCH, DELETE, OPTIONS');
                  res.statusCode = 204;
                  res.end();
                  return;
                }

                const bodyText =
                  req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
                const body = bodyText ? JSON.parse(bodyText) : {};
                const result = await externalApiServer.handleExternalApiRequest(
                  req.headers,
                  req.method,
                  req.url,
                  body,
                );

                if (result.headers) {
                  for (const [name, value] of Object.entries(result.headers)) {
                    res.setHeader(name, value);
                  }
                }

                sendJson(res as ServerResponse, result.statusCode, result.body);
                return;
              }

              if (req.url?.startsWith('/api/internal')) {
                const creativeAssetServer = await import('./src/services/creativeAssetServer');

                if (req.method === 'OPTIONS') {
                  res.setHeader('Allow', 'GET, POST, PATCH, OPTIONS');
                  res.statusCode = 204;
                  res.end();
                  return;
                }

                const bodyText =
                  req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
                const body = bodyText ? JSON.parse(bodyText) : {};
                const result = await creativeAssetServer.handleCreativeAssetRequest(
                  req.headers,
                  req.method,
                  req.url,
                  body,
                );

                sendJson(res as ServerResponse, result.statusCode, result.body);
                return;
              }

              if (req.url?.startsWith('/api/api-keys')) {
                const apiKeyServer = await import('./src/services/apiKeyServer');

                if (req.method === 'OPTIONS') {
                  res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
                  res.statusCode = 204;
                  res.end();
                  return;
                }

                const bodyText = await readBody(req);
                const body = bodyText ? JSON.parse(bodyText) : {};

                if (req.method === 'GET') {
                  const result = await apiKeyServer.listApiKeysFromHeaders(req.headers);
                  sendJson(res as ServerResponse, 200, result);
                  return;
                }

                if (req.method === 'POST') {
                  const result = await apiKeyServer.createApiKeyFromHeaders(req.headers, body);
                  sendJson(res as ServerResponse, 201, result);
                  return;
                }

                if (req.method === 'DELETE') {
                  const result = await apiKeyServer.revokeApiKeyFromHeaders(req.headers, body);
                  sendJson(res as ServerResponse, 200, result);
                  return;
                }

                res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
                sendJson(res as ServerResponse, 405, { error: 'Method not allowed' });
                return;
              }

              const geminiServer = await import('./src/services/geminiServer');
              const apiKeyServer = await import('./src/services/apiKeyServer');
              await apiKeyServer.authorizeFirebaseUserFromHeaders(req.headers);

              if (req.method === 'GET') {
                sendJson(res as ServerResponse, 200, {
                  ok: true,
                  model: 'gemini-3.1-flash-lite-preview',
                  rateLimit: geminiServer.getGeminiRateLimitSnapshot(),
                });
                return;
              }

              if (req.method !== 'POST') {
                res.setHeader('Allow', 'GET, POST');
                sendJson(res as ServerResponse, 405, { error: 'Method not allowed' });
                return;
              }

              const bodyText = await readBody(req);
              const body = bodyText ? JSON.parse(bodyText) : {};
              const result = await geminiServer.handleGeminiIngestionRequest(body);
              sendJson(res as ServerResponse, 200, result);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to process Gemini request.';
              const statusCode =
                typeof error === 'object' &&
                error !== null &&
                'statusCode' in error &&
                typeof (error as { statusCode?: unknown }).statusCode === 'number'
                  ? (error as { statusCode: number }).statusCode
                  : error instanceof SyntaxError
                    ? 400
                    : 500;
              sendJson(res as ServerResponse, statusCode, { error: message });
            }
          });
        },
      },
    ],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@replofy/runtime-app': path.resolve(
          __dirname,
          standalonePlatform ? 'src/StandaloneApp.tsx' : 'src/App.tsx',
        ),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify this file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: standalonePlatform
        ? {
            '/api/auth': 'http://127.0.0.1:4100',
            '/api/setup': 'http://127.0.0.1:4100',
            '/api/invitations': 'http://127.0.0.1:4100',
            '/api/workspaces': 'http://127.0.0.1:4100',
            '/api/v1': 'http://127.0.0.1:4100',
          }
        : undefined,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(moduleId) {
            const normalized = moduleId.replaceAll('\\', '/');
            if (
              normalized.includes('/node_modules/firebase/') ||
              normalized.includes('/node_modules/@firebase/') ||
              normalized.endsWith('/src/firebase.ts')
            ) {
              return 'firebase-compat';
            }
          },
        },
      },
    },
  };
});
