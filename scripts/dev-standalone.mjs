import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;

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
  console.log('[replofy-os] applying standalone database migrations');
  await runOnce(['run', 'db:migrate']);
  console.log('[replofy-os] starting standalone API on http://127.0.0.1:4100');
  start(['run', 'server:dev']);
  console.log('[replofy-os] starting standalone Vite app on http://127.0.0.1:4000');
  start(['run', 'dev'], { ...process.env, VITE_REPLOFY_PLATFORM: 'standalone' });
} catch (error) {
  console.error(`[replofy-os] standalone development startup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
