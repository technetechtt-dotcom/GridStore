import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const PREFIX = 'enc:v1:';

function encryptionKey() {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || env.jwtSecret;
  return createHash('sha256').update(material).digest();
}

/** Encrypt a secret at rest (AES-256-GCM). Plaintext is returned unchanged only in tests without key. */
export function encryptSecret(plaintext: string) {
  if (!plaintext) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const [, packed] = value.split(PREFIX);
  const [ivB64, tagB64, dataB64] = (packed ?? '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Corrupt encrypted secret');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
