import { contentDisposition, generateStorageKey } from './storage-key.js';

describe('generateStorageKey', () => {
  it('gera chave interna sem relação com o nome original', () => {
    const key = generateStorageKey('prescriptions', new Date('2026-10-01T00:00:00Z'));
    expect(key).toMatch(/^prescriptions\/2026\/10\/[0-9a-f-]{36}$/);
  });

  it('não repete', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateStorageKey()));
    expect(keys.size).toBe(1000);
  });
});

describe('contentDisposition', () => {
  it('neutraliza aspas, barras e quebras de linha (header injection)', () => {
    const value = contentDisposition('attachment', 'a"b\\c/d\r\nSet-Cookie: x.pdf');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value).toContain('filename="a_b_c_d__Set-Cookie: x.pdf"');
  });

  it('preserva acentos via filename* e usa fallback ASCII', () => {
    const value = contentDisposition('inline', 'Receita João.pdf');
    expect(value).toContain('filename="Receita Joa_o.pdf"');
    expect(value).toContain("filename*=UTF-8''Receita%20Jo%C3%A3o.pdf");
  });
});
