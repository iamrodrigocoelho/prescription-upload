import {
  generatePatientLinkToken,
  hashPatientLinkToken,
  isWellFormedPatientLinkToken,
} from './patient-link-token.js';

describe('token do link personalizado', () => {
  it('gera 32 bytes em base64url e o hash SHA-256 correspondente', () => {
    const { token, tokenHash } = generatePatientLinkToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(isWellFormedPatientLinkToken(token)).toBe(true);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashPatientLinkToken(token));
    expect(tokenHash).not.toContain(token);
  });

  it('é imprevisível: sem repetição em 10.000 gerações', () => {
    const tokens = new Set(Array.from({ length: 10_000 }, () => generatePatientLinkToken().token));
    expect(tokens.size).toBe(10_000);
  });

  it('rejeita formatos inválidos sem consultar o banco', () => {
    for (const value of [
      '',
      'curto',
      'a'.repeat(44),
      `${'a'.repeat(42)}=`,
      '../../etc/passwd',
      null,
      123,
    ]) {
      expect(isWellFormedPatientLinkToken(value)).toBe(false);
    }
  });
});
