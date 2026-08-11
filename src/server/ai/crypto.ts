import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { ServerConfig } from '../config.js';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(config: ServerConfig) {
  return createHash('sha256')
    .update(config.aiSecretsKey || `${config.authSecret}:replofy-ai-provider-credentials`)
    .digest();
}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export function encryptSecret(config: ServerConfig, value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(config), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    keyVersion: 1,
  };
}

export function decryptSecret(
  config: ServerConfig,
  value: Pick<EncryptedSecret, 'ciphertext' | 'iv' | 'authTag'>,
) {
  const decipher = createDecipheriv(ALGORITHM, deriveKey(config), Buffer.from(value.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
