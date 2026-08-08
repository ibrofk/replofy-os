import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const runId = randomUUID();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const fixtureFileArgument = process.env.REPLOFY_HTTP_RECONNECT_FIXTURE_FILE?.trim();
const serverUrl = process.env.REPLOFY_RECONNECT_SERVER_URL || 'http://127.0.0.1:4120';
const serverPort = String(new URL(serverUrl).port || (serverUrl.startsWith('https://') ? 443 : 80));
const ownsDataDirectory = !process.env.REPLOFY_RECONNECT_DATA_DIR;
const dataDirectory = path.resolve(process.env.REPLOFY_RECONNECT_DATA_DIR || `.tmp/database-reconnect-${runId}`);

function isWithin(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`));
}

if (!fixtureFileArgument) throw new Error('REPLOFY_HTTP_RECONNECT_FIXTURE_FILE is required.');
const fixtureFile = path.resolve(fixtureFileArgument);
const runnerTemp = process.env.RUNNER_TEMP ? path.resolve(process.env.RUNNER_TEMP) : null;
const workspaceTemp = path.resolve('.tmp');
if ((!runnerTemp || !isWithin(runnerTemp, fixtureFile)) && !isWithin(workspaceTemp, fixtureFile)) {
  throw new Error('REPLOFY_HTTP_RECONNECT_FIXTURE_FILE must be inside RUNNER_TEMP or the workspace .tmp directory.');
}

let fixture;
try {
  fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
} finally {
  await rm(fixtureFile, { force: true });
}
for (const field of ['sessionCookie', 'taskId', 'taskTitle', 'taskStatus']) {
  if (typeof fixture[field] !== 'string' || !fixture[field]) {
    throw new Error(`Reconnect fixture is missing ${field}.`);
  }
}

const serverEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: serverPort,
  REPLOFY_SERVER_URL: serverUrl,
  REPLOFY_TRUSTED_ORIGINS: serverUrl,
  REPLOFY_SECURE_COOKIES: 'false',
  REPLOFY_DATA_DIR: dataDirectory,
};

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendOutput(state, chunk) {
  state.output = `${state.output}${chunk}`.slice(-8_000);
}

function safeOutput(output) {
  return Object.entries(process.env)
    .filter(([name, value]) => /database_url|password|secret|token|api[_-]?key/i.test(name) && value && value.length >= 8)
    .reduce((text, [, value]) => text.split(value).join('[REDACTED]'), output);
}

function startServer() {
  const state = { output: '' };
  const child = spawn(npmCommand, ['run', 'server:dev'], {
    cwd: process.cwd(),
    env: serverEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => appendOutput(state, chunk));
  child.stderr?.on('data', (chunk) => appendOutput(state, chunk));
  return { child, state };
}

async function waitForExit(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) return;
  await once(handle.child, 'exit');
}

async function stopServer(handle) {
  if (!handle || handle.child.exitCode !== null || handle.child.signalCode !== null) return;
  const pid = handle.child.pid;
  if (pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  }
  await Promise.race([
    waitForExit(handle),
    delay(10_000).then(() => {
      if (handle.child.exitCode === null && handle.child.signalCode === null) {
        try { handle.child.kill('SIGKILL'); } catch { /* already gone */ }
      }
    }),
  ]);
}

async function waitForReady(handle) {
  const deadline = Date.now() + 30_000;
  let lastError = 'server did not become ready';
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
      throw new Error(`standalone server exited before readiness: ${safeOutput(handle.state.output)}`);
    }
    try {
      const response = await fetch(`${serverUrl}/health/ready`);
      if (response.status === 200) return;
      lastError = `health endpoint returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`${lastError}; server output: ${safeOutput(handle.state.output)}`);
}

async function request(pathname, cookie = '') {
  const headers = new Headers({ origin: serverUrl });
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${serverUrl}${pathname}`, { headers });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
}

async function run() {
  let handle;
  try {
    handle = startServer();
    await waitForReady(handle);

    let result = await request('/api/setup/status');
    if (result.response.status !== 200 || result.payload?.needsBootstrap !== false) {
      throw new Error(`post-restart setup status was not ready: HTTP ${result.response.status}`);
    }

    result = await request('/api/v1/tasks', fixture.sessionCookie);
    if (result.response.status !== 200) {
      throw new Error(`post-restart task query returned HTTP ${result.response.status}.`);
    }
    const tasks = Array.isArray(result.payload?.data) ? result.payload.data : [];
    if (!tasks.some((task) => task.id === fixture.taskId && task.title === fixture.taskTitle && task.status === fixture.taskStatus)) {
      throw new Error('post-restart API did not return the preserved task fixture.');
    }
    console.log('Database restart reconnect rehearsal passed: fresh API process served the preserved authenticated task.');
  } finally {
    await stopServer(handle, true);
    if (ownsDataDirectory) await rm(dataDirectory, { recursive: true, force: true });
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
