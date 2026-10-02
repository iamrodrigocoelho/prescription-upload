import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitize, setAnalyticsProvider, track } from './analytics';

describe('analytics', () => {
  afterEach(() => setAnalyticsProvider({ track: () => undefined }));

  it('descarta chaves fora da allowlist (ex.: cpf, token, nome de arquivo)', () => {
    expect(
      sanitize({
        entry: 'generic',
        cpf: '52998224725',
        token: 'abc',
        fileName: 'receita joão.jpg',
        fileCount: 2,
      }),
    ).toEqual({ entry: 'generic', fileCount: 2 });
  });

  it('descarta valores com formato inesperado mesmo em chaves permitidas', () => {
    expect(sanitize({ code: 'Erro com espaço e CPF 529.982.247-25', entry: 'store_link' })).toEqual(
      {
        entry: 'store_link',
      },
    );
  });

  it('envia ao provider apenas o payload sanitizado', () => {
    const spy = vi.fn();
    setAnalyticsProvider({ track: spy });
    track('file_added', { entry: 'generic', fileType: 'image' });
    expect(spy).toHaveBeenCalledWith('file_added', { entry: 'generic', fileType: 'image' });
  });

  it('falha do provider não interrompe o fluxo', () => {
    setAnalyticsProvider({
      track: () => {
        throw new Error('falhou');
      },
    });
    expect(() => track('recaptcha_completed', { entry: 'generic' })).not.toThrow();
  });
});
