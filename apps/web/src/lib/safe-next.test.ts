import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('aceita caminhos internos do Admin', () => {
    expect(safeNextPath('/admin/links')).toBe('/admin/links');
    expect(safeNextPath('/admin/links?status=ACTIVE')).toBe('/admin/links?status=ACTIVE');
  });

  it.each([
    null,
    '',
    'https://atacante.example/admin',
    '//atacante.example/admin',
    '/\\atacante.example',
    '/admin\\..\\x',
    '/login',
    'javascript:alert(1)',
    '/admin\u0000',
  ])('rejeita %s', (value) => {
    expect(safeNextPath(value)).toBe('/admin');
  });
});
