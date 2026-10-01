import { randomBytes } from 'node:crypto';
import {
  decryptField,
  encryptField,
  generateToken,
  hmacSha256,
  randomBase62,
  sha256Hex,
} from './primitives.js';

const key = randomBytes(32);

describe('encryptField / decryptField (AES-256-GCM)', () => {
  it('faz round-trip', () => {
    const payload = encryptField('52998224725', key, 'cpf');
    expect(decryptField(payload, key, 'cpf')).toBe('52998224725');
  });

  it('não contém o texto puro e usa IV aleatório', () => {
    const a = encryptField('52998224725', key, 'cpf');
    const b = encryptField('52998224725', key, 'cpf');
    expect(a).not.toContain('52998224725');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
  });

  it('falha com contexto (AAD) diferente — impede troca entre campos', () => {
    const payload = encryptField('segredo', key, 'cpf');
    expect(() => decryptField(payload, key, 'totp')).toThrow();
  });

  it('falha com chave errada', () => {
    const payload = encryptField('segredo', key, 'cpf');
    expect(() => decryptField(payload, randomBytes(32), 'cpf')).toThrow();
  });

  it('detecta adulteração do ciphertext', () => {
    const [v, iv, tag, ct = ''] = encryptField('segredo', key, 'cpf').split(':');
    const tampered = Buffer.from(ct, 'base64url');
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(() =>
      decryptField([v, iv, tag, tampered.toString('base64url')].join(':'), key, 'cpf'),
    ).toThrow();
  });

  it('rejeita formato inválido', () => {
    expect(() => decryptField('lixo', key, 'cpf')).toThrow(/inválido/);
  });
});

describe('hashes', () => {
  it('hmacSha256 depende do segredo', () => {
    expect(hmacSha256('52998224725', 'a')).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256('52998224725', 'a')).not.toBe(hmacSha256('52998224725', 'b'));
    expect(hmacSha256('52998224725', 'a')).toBe(hmacSha256('52998224725', 'a'));
  });

  it('sha256Hex é determinístico', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('generateToken', () => {
  it('gera 32 bytes em base64url (43 caracteres, sem padding)', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('não repete', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(tokens.size).toBe(1000);
  });
});

describe('randomBase62', () => {
  it('gera o tamanho pedido apenas com base62', () => {
    expect(randomBase62(12)).toMatch(/^[0-9A-Za-z]{12}$/);
  });

  it('distribuição cobre o alfabeto', () => {
    const chars = new Set(randomBase62(5000).split(''));
    expect(chars.size).toBe(62);
  });
});
