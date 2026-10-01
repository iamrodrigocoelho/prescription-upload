import { describe, expect, it } from 'vitest';
import { deriveLinkStatus } from './patient-link-status.js';

const now = new Date('2026-10-01T12:00:00Z');
const future = new Date('2026-10-08T12:00:00Z');
const past = new Date('2026-09-30T12:00:00Z');

describe('deriveLinkStatus', () => {
  it('ativo e dentro da validade → ACTIVE', () => {
    expect(deriveLinkStatus({ status: 'ACTIVE', expiresAt: future }, now)).toBe('ACTIVE');
  });

  it('ativo e vencido → EXPIRED (sem depender de job)', () => {
    expect(deriveLinkStatus({ status: 'ACTIVE', expiresAt: past }, now)).toBe('EXPIRED');
  });

  it('expira exatamente no instante de expires_at', () => {
    expect(deriveLinkStatus({ status: 'ACTIVE', expiresAt: now }, now)).toBe('EXPIRED');
  });

  it('utilizado e revogado prevalecem sobre a expiração', () => {
    expect(deriveLinkStatus({ status: 'USED', expiresAt: past }, now)).toBe('USED');
    expect(deriveLinkStatus({ status: 'REVOKED', expiresAt: past }, now)).toBe('REVOKED');
    expect(deriveLinkStatus({ status: 'REVOKED', expiresAt: future }, now)).toBe('REVOKED');
  });

  it('aceita datas em ISO string', () => {
    expect(deriveLinkStatus({ status: 'ACTIVE', expiresAt: future.toISOString() }, now)).toBe(
      'ACTIVE',
    );
  });
});
