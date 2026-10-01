import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from 'node:crypto';

/**
 * Primitivas criptográficas puras (sem estado), testadas isoladamente.
 */

const CIPHER_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM. Formato: `v1:<iv>:<tag>:<ciphertext>` (base64url). O prefixo de
 * versão permite rotação de chave futura. O `context` entra como AAD: um texto
 * cifrado de um campo (ex.: CPF) não decifra se colado em outro (ex.: TOTP).
 */
export function encryptField(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join(':');
}

export function decryptField(payload: string, key: Buffer, context: string): string {
  const [version, iv, tag, ciphertext] = payload.split(':');
  if (version !== CIPHER_VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Formato de campo cifrado inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** HMAC-SHA256 em hex (64 caracteres). */
export function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** SHA-256 em hex — usado para persistir tokens de alta entropia. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Token opaco: `bytes` aleatórios do CSPRNG em base64url. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** String base62 uniforme (sem viés de módulo — `randomInt` usa rejection sampling). */
export function randomBase62(length: number): string {
  let output = '';
  for (let i = 0; i < length; i += 1) output += BASE62.charAt(randomInt(BASE62.length));
  return output;
}
