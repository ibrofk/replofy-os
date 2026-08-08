import { readFile } from 'node:fs/promises';
import path from 'node:path';

const buildDirectory = path.resolve(process.argv[2] || '.tmp/standalone-verify');
const manifestPath = path.join(buildDirectory, '.vite', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entry = Object.values(manifest).find((record) => record.isEntry && record.src === 'index.html');
if (!entry) throw new Error(`No index.html entry found in ${manifestPath}.`);

const eagerChunks = new Set();
const visit = (key) => {
  if (eagerChunks.has(key)) return;
  eagerChunks.add(key);
  for (const imported of manifest[key]?.imports || []) visit(imported);
};
for (const imported of entry.imports || []) visit(imported);

const firebaseChunks = [...eagerChunks].filter((key) => {
  const record = manifest[key];
  return /firebase/i.test(`${key} ${record?.name || ''} ${record?.file || ''}`);
});
if (firebaseChunks.length > 0) {
  throw new Error(`Standalone entry eagerly imports Firebase chunks: ${firebaseChunks.join(', ')}`);
}

const html = await readFile(path.join(buildDirectory, 'index.html'), 'utf8');
if (/modulepreload[^>]+firebase/i.test(html)) {
  throw new Error('Standalone index preloads a Firebase compatibility chunk.');
}

console.log(
  `Standalone bundle boundary passed: ${entry.file}; ` +
  `${(entry.dynamicImports || []).length} optional dynamic import(s), no eager Firebase dependency.`,
);
