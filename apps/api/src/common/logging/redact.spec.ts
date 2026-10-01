import { REDACTED, sanitizeUrl, scrubSensitive, scrubString } from './redact.js';

describe('scrubSensitive', () => {
  it('remove chaves sensíveis em qualquer profundidade', () => {
    const input = {
      email: 'a@b.com',
      password: 'Senha!Forte123',
      nested: {
        token: 'abc',
        tokenHash: 'def',
        cpf: '52998224725',
        totpSecret: 'JBSWY3DP',
        code: '123456',
        deep: { recoveryCodes: ['x'], authorization: 'Bearer y', cookie: 'rv_session=z' },
      },
      statusCode: 200,
    };
    const output = scrubSensitive(input) as typeof input;
    expect(output.email).toBe('a@b.com');
    expect(output.statusCode).toBe(200);
    expect(output.password).toBe(REDACTED);
    expect(output.nested.token).toBe(REDACTED);
    expect(output.nested.tokenHash).toBe(REDACTED);
    expect(output.nested.cpf).toBe(REDACTED);
    expect(output.nested.totpSecret).toBe(REDACTED);
    expect(output.nested.code).toBe(REDACTED);
    expect(output.nested.deep.recoveryCodes).toBe(REDACTED);
    expect(output.nested.deep.authorization).toBe(REDACTED);
    expect(output.nested.deep.cookie).toBe(REDACTED);
  });

  it('mascara CPFs em strings livres', () => {
    const output = scrubSensitive({ msg: 'paciente 529.982.247-25 e 11144477735' }) as {
      msg: string;
    };
    expect(output.msg).not.toMatch(/529\.982|11144477735/);
  });

  it('serializa erros sem vazar CPF na mensagem', () => {
    const output = scrubSensitive(new Error('falha para 52998224725')) as { message: string };
    expect(output.message).toBe('falha para ***.***.***-**');
  });

  it('não altera números que não são CPF', () => {
    expect(scrubString('pedido 12345 em 2026')).toBe('pedido 12345 em 2026');
  });
});

describe('sanitizeUrl', () => {
  it('remove query string', () => {
    expect(sanitizeUrl('/patients/search?cpf=52998224725')).toBe('/patients/search');
  });

  it('substitui o token de links personalizados', () => {
    expect(sanitizeUrl('/p/abcDEF123_-xyz')).toBe(`/p/${REDACTED}`);
    expect(sanitizeUrl('/public/patient-links/abcDEF123/prescriptions')).toBe(
      `/public/patient-links/${REDACTED}/prescriptions`,
    );
  });

  it('mantém rotas comuns', () => {
    expect(sanitizeUrl('/admin/stores/3f1c')).toBe('/admin/stores/3f1c');
    expect(sanitizeUrl(undefined)).toBe('');
  });
});
