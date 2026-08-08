import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;

function start(script) {
  const child = spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });

  children.push(child);
  child.once('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`${script} exited unexpectedly (${signal || code}).`);
      stop(code || 1);
    }
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

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('emulators');
start('dev');
