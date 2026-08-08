import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const runId = randomUUID();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const serverUrl = process.env.REPLOFY_RECOVERY_SERVER_URL || 'http://127.0.0.1:4110';
const serverPort = String(new URL(serverUrl).port || (serverUrl.startsWith('https://') ? 443 : 80));
const bootstrapToken = process.env.REPLOFY_BOOTSTRAP_TOKEN?.trim();
const ownsDataDirectory = !process.env.REPLOFY_RECOVERY_DATA_DIR;
const dataDirectory = path.resolve(process.env.REPLOFY_RECOVERY_DATA_DIR || `.tmp/process-recovery-${runId}`);

if (!bootstrapToken) throw new Error('REPLOFY_BOOTSTRAP_TOKEN is required for process recovery rehearsal.');

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
  const state = { output: '', error: null };
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
  child.once('error', (error) => { state.error = error; });
  return { child, state };
}

async function waitForExit(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) return;
  await once(handle.child, 'exit');
}

async function stopServer(handle, force = false) {
  if (!handle || handle.child.exitCode !== null || handle.child.signalCode !== null) return;
  const pid = handle.child.pid;
  if (pid && force) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  } else if (!handle.child.killed) {
    handle.child.kill('SIGTERM');
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

function sessionCookie(response) {
  const headers = response.headers;
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ');
}

async function request(pathname, method = 'GET', body, cookie = '') {
  const headers = new Headers({ origin: serverUrl });
  if (cookie) headers.set('cookie', cookie);
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);
  if (encodedBody !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`${serverUrl}${pathname}`, {
    method,
    headers,
    body: encodedBody,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { response, payload };
}

function assertStatus(result, expected, context) {
  if (result.response.status !== expected) {
    throw new Error(`${context}: expected HTTP ${expected}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);
  }
}

async function run() {
  const email = `recovery-${runId.slice(0, 8)}@example.com`;
  const password = 'process-recovery-password';
  const workspaceSlug = `recovery-${runId.slice(0, 8)}`;
  let handle;
  let cookie = '';
  try {
    handle = startServer();
    await waitForReady(handle);

    let result = await request('/api/setup/status');
    assertStatus(result, 200, 'initial setup status');
    if (result.payload?.needsBootstrap !== true) throw new Error('recovery database is not empty; expected needsBootstrap=true.');

    result = await request('/api/setup/bootstrap', 'POST', {
      token: bootstrapToken,
      name: 'Process Recovery Owner',
      email,
      password,
      workspaceName: 'Process Recovery Workspace',
      workspaceSlug,
    });
    assertStatus(result, 201, 'bootstrap');
    const workspaceId = result.payload?.workspace?.id;
    if (typeof workspaceId !== 'string') throw new Error('bootstrap response did not include a workspace id.');

    result = await request('/api/auth/sign-in/email', 'POST', { email, password });
    if (!result.response.ok) throw new Error(`sign-in failed with HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`);
    cookie = sessionCookie(result.response);
    if (!cookie) throw new Error('sign-in did not return a session cookie.');

    result = await request(`/api/workspaces/${workspaceId}/activate`, 'POST', {}, cookie);
    assertStatus(result, 200, 'workspace activation');

    result = await request('/api/v1/tasks', 'POST', {
      title: 'Survive an API process crash',
      status: 'todo',
      effortPoints: 1,
    }, cookie);
    assertStatus(result, 201, 'task creation');
    const taskId = result.payload?.id;
    if (typeof taskId !== 'string') throw new Error('task response did not include an id.');

    await stopServer(handle, true);
    handle = startServer();
    await waitForReady(handle);

    result = await request('/api/setup/status');
    assertStatus(result, 200, 'post-crash setup status');
    if (result.payload?.needsBootstrap !== false) throw new Error('bootstrap state did not survive process crash.');

    result = await request('/api/v1/tasks', 'GET', undefined, cookie);
    assertStatus(result, 200, 'post-crash task listing');
    const tasks = Array.isArray(result.payload?.data) ? result.payload.data : [];
    if (!tasks.some((task) => task.id === taskId && task.title === 'Survive an API process crash')) {
      throw new Error('created task was not returned after process crash and restart.');
    }
    console.log('Process crash/restart rehearsal passed: bootstrap, session, workspace, and task persisted.');
  } finally {
    try {
      await stopServer(handle);
    } finally {
      if (ownsDataDirectory) await rm(dataDirectory, { recursive: true, force: true });
    }
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
