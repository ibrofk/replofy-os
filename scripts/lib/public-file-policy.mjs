const generatedDirectoryNames = new Set([
  '.git',
  '.replofy',
  '.npm-cache',
  '.tmp',
  '.venv',
  '.vercel',
  'backup',
  'backups',
  'build',
  'coverage',
  'data',
  'dist',
  'dist-server',
  'emulator_data',
  'node_modules',
  'venv',
]);

const sensitiveExtensionPattern = /\.(?:bak|backup|db|der|dump|jks|key|keystore|log|p12|pfx|pem|sqlite|sqlite3|tfstate)$/i;
const sensitiveNamePattern = /^(?:credentials?|secret|service[-_ ]?account|firebase[-_ ]?service[-_ ]?account|id_(?:rsa|dsa|ecdsa|ed25519))(?:[._-].*)?$/i;
const sensitiveDotFiles = new Set(['.netrc', '.npmrc', '.pypirc']);

export function isIgnoredPublicDirectory(name) {
  const normalized = name.toLowerCase();
  return generatedDirectoryNames.has(normalized) ||
    normalized.startsWith('.venv') ||
    normalized.startsWith('firebase-export-');
}

export function publicFileRisk(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const segments = normalized.split('/');
  const basename = segments.at(-1) || '';

  if (segments.some((segment) => isIgnoredPublicDirectory(segment))) {
    return 'generated data/build directory';
  }
  if (/^\.env(?:\..+)?$/i.test(basename) && basename.toLowerCase() !== '.env.example') {
    return 'environment file';
  }
  if (sensitiveDotFiles.has(basename.toLowerCase())) return 'credential configuration file';
  if (sensitiveExtensionPattern.test(basename)) return 'credential or database artifact extension';
  if (/^terraform\.tfstate(?:\..*)?$/i.test(basename)) return 'Terraform state file';
  if (sensitiveNamePattern.test(basename)) return 'credential-like filename';
  return null;
}
