import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const algorithm = 'aes-256-gcm';

function getKey() {
  const secret = process.env.OAUTH_TOKEN_ENCRYPTION_KEY ?? process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY or JWT_SECRET must be at least 32 characters long');
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split('.');

  if (!iv || !tag || !encrypted) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = createDecipheriv(algorithm, getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
