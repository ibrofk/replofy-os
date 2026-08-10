import 'dotenv/config';
import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;
const DEFAULT_AUTH_SECRET = 'replofy-os-local-development-auth-secret-change-me';
const AI_SECRETS_KEY_SUFFIX = ':replofy-ai-provider-credentials';

function environmentValue(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const resolvedAuthSecret = environmentValue('BETTER_AUTH_SECRET', DEFAULT_AUTH_SECRET);
const resolvedAISecretsKey = environmentValue(
  'REPLOFY_AI_SECRETS_KEY',
  `${resolvedAuthSecret}${AI_SECRETS_KEY_SUFFIX}`,
);

const standaloneEnvironment = {
  ...process.env,
  DATABASE_URL: environmentValue(
    'DATABASE_URL',
    'postgres://replofy:replofy-local-change-me@127.0.0.1:5432/replofy',
  ),
  BETTER_AUTH_SECRET: resolvedAuthSecret,
  REPLOFY_AI_SECRETS_KEY: resolvedAISecretsKey,
  REPLOFY_BOOTSTRAP_TOKEN: environmentValue(
    'REPLOFY_BOOTSTRAP_TOKEN',
    'replofy-os-local-development-bootstrap-token-change-me',
  ),
  REPLOFY_ASSET_STORE: environmentValue('REPLOFY_ASSET_STORE', 'filesystem'),
  REPLOFY_SECURE_COOKIES: environmentValue('REPLOFY_SECURE_COOKIES', 'false'),
  REPLOFY_SERVER_URL: environmentValue('REPLOFY_SERVER_URL', 'http://localhost:4100'),
  REPLOFY_TRUSTED_ORIGINS: environmentValue(
    'REPLOFY_TRUSTED_ORIGINS',
    'http://localhost:4100,http://localhost:4000,http://127.0.0.1:4100,http://127.0.0.1:4000',
  ),
  SERVER_HOST: environmentValue('SERVER_HOST', '127.0.0.1'),
  SERVER_PORT: environmentValue('SERVER_PORT', '4100'),
};

const usesDevelopmentDefaults = !process.env.DATABASE_URL?.trim()
  || !process.env.BETTER_AUTH_SECRET?.trim()
  || !process.env.REPLOFY_BOOTSTRAP_TOKEN?.trim();

function runOnce(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`npm ${args.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`));
    });
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
}

function start(args, env = process.env) {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  children.push(child);
  child.once('error', (error) => {
    if (!stopping) {
      console.error(error);
      stop(1);
    }
  });
  child.once('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`${args.join(' ')} exited unexpectedly (${signal || code}).`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
  if (usesDevelopmentDefaults) {
    console.log('[replofy-os] using local development defaults; set .env for a custom standalone instance');
    console.log(`[replofy-os] first-run bootstrap token: ${standaloneEnvironment.REPLOFY_BOOTSTRAP_TOKEN}`);
  }
  console.log('[replofy-os] applying standalone database migrations');
  await runOnce(['run', 'db:migrate'], standaloneEnvironment);
  console.log('[replofy-os] starting standalone API on http://127.0.0.1:4100');
  start(['run', 'server:dev'], standaloneEnvironment);
  console.log('[replofy-os] starting standalone Vite app on http://127.0.0.1:4000');
  start(['run', 'dev', '--', '--host', '127.0.0.1'], {
    ...standaloneEnvironment,
    VITE_REPLOFY_PLATFORM: 'standalone',
  });
} catch (error) {
  console.error(`[replofy-os] standalone development startup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
