import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';

const port = process.env.CREATIVE_HUB_TEST_API_PORT || '4010';
const apiBase = process.env.CREATIVE_HUB_TEST_API_BASE || `http://127.0.0.1:${port}`;
const viteScript = path.resolve('node_modules/vite/bin/vite.js');
const testScript = path.resolve('scripts/test-creative-asset-api.mjs');
const env = {
  ...process.env,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || 'replofy-test',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || 'test-api-key',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || 'test-api-secret',
  CREATIVE_HUB_TEST_API_BASE: apiBase,
};

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await response.arrayBuffer();
          resolve();
          return;
        }
      } catch {
        // Vite is still starting.
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for the Creative Hub test server at ${url}.`));
        return;
      }

      setTimeout(attempt, 250);
    };

    void attempt();
  });
}

const vite = spawn(process.execPath, [viteScript, '--port', port, '--host', '127.0.0.1'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
});

try {
  await waitForServer(apiBase);

  const test = spawn(process.execPath, [testScript], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });
  const [exitCode] = await once(test, 'exit');
  if (exitCode !== 0) {
    process.exitCode = exitCode || 1;
  }
} finally {
  vite.kill();
}

process.exit(process.exitCode || 0);
