import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const licenseOverrides = JSON.parse(await readFile(
  path.join(root, 'docs', 'third-party-license-overrides.json'),
  'utf8',
));

// Keep this allowlist intentionally explicit. A new dependency with an
// unfamiliar license should make the release gate fail for human review.
const allowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'public domain',
]);

function packagePath(lockPath) {
  return path.join(root, ...lockPath.split('/'), 'package.json');
}

function packageNameFromLockPath(lockPath) {
  const parts = lockPath.split('/');
  const packagePart = parts.at(-1);
  const scopePart = parts.at(-2);
  return scopePart?.startsWith('@') ? `${scopePart}/${packagePart}` : packagePart;
}

function licenseValues(metadata) {
  if (typeof metadata.license === 'string') return [metadata.license.trim()];
  if (Array.isArray(metadata.licenses)) {
    return metadata.licenses
      .map((value) => typeof value === 'string' ? value : value?.type)
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => value.trim());
  }
  return [];
}

function splitExpression(value) {
  return value
    .replace(/[()[\]]/g, '')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findLicenseFile(packageDirectory) {
  return [
    'LICENSE',
    'LICENSE.txt',
    'LICENSE.md',
    'LICENSE-MIT',
    'LICENCE',
    'LICENCE.txt',
  ].find((name) => existsSync(path.join(packageDirectory, name)));
}

const failures = [];
const metadataFallbacks = [];
let scanned = 0;

for (const [lockPath, lockEntry] of Object.entries(lock.packages || {})) {
  if (!lockPath.startsWith('node_modules/')) continue;
  const packageJson = packagePath(lockPath);
  const lockName = packageNameFromLockPath(lockPath);
  const lockVersion = lockEntry.version || 'unknown';
  const override = licenseOverrides[`${lockName}@${lockVersion}`];
  if (!existsSync(packageJson)) {
    const values = licenseValues(lockEntry);
    if (values.length === 0 && typeof override?.spdx === 'string') {
      values.push(override.spdx.trim());
      metadataFallbacks.push(`${lockName}@${lockVersion} (explicit override: ${override.evidence})`);
    } else if (values.length > 0) {
      metadataFallbacks.push(`${lockName}@${lockVersion} (package-lock metadata)`);
    } else if (lockEntry.optional) {
      // Platform-specific optional packages may be absent and may omit
      // metadata from the lockfile; there is no package to inspect locally.
      continue;
    } else {
      failures.push(`${lockPath}: package is listed in the lockfile but has no license metadata and is not installed.`);
      continue;
    }
    scanned += 1;
    for (const value of values) {
      const terms = splitExpression(value);
      if (terms.length === 0 || terms.some((term) => !allowedLicenses.has(term))) {
        failures.push(`${lockName}@${lockVersion}: unapproved license expression "${value}".`);
      }
    }
    continue;
  }

  const metadata = JSON.parse(await readFile(packageJson, 'utf8'));
  const packageDirectory = path.dirname(packageJson);
  const name = metadata.name || lockPath.slice('node_modules/'.length);
  const version = metadata.version || lockEntry.version || 'unknown';
  scanned += 1;
  const values = licenseValues(metadata);

  if (values.length === 0) {
    const licenseFile = findLicenseFile(packageDirectory);
    if (licenseFile) {
      metadataFallbacks.push(`${name}@${version} (${licenseFile})`);
      continue;
    }
    if (typeof override?.spdx === 'string') {
      values.push(override.spdx.trim());
      metadataFallbacks.push(`${name}@${version} (explicit override: ${override.evidence})`);
    }
  }

  if (values.length === 0) {
    failures.push(`${name}@${version}: no license metadata or license file.`);
    continue;
  }

  for (const value of values) {
    const terms = splitExpression(value);
    if (terms.length === 0 || terms.some((term) => !allowedLicenses.has(term))) {
      failures.push(`${name}@${version}: unapproved license expression "${value}".`);
    }
  }
}

if (failures.length > 0) {
  console.error('License scan failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`License scan passed across ${scanned} lockfile packages.`);
if (metadataFallbacks.length > 0) {
  console.log(`License metadata fallback evidence used: ${metadataFallbacks.length}.`);
}
