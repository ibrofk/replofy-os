import { rm } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const targets = ['dist', 'dist-server', 'coverage', '.tmp'];

for (const target of targets) {
  await rm(path.join(repositoryRoot, target), { force: true, recursive: true });
}

console.log(`Removed generated output: ${targets.join(', ')}`);
