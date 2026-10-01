import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('aceita o ambiente de teste', () => {
    expect(() => parseEnv(process.env)).not.toThrow();
  });

  it('não expõe valores de segredo na mensagem de erro', () => {
    const secret = 'curto-demais';
    try {
      parseEnv({ ...process.env, SESSION_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('SESSION_SECRET');
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('rejeita chave de criptografia com tamanho errado', () => {
    expect(() =>
      parseEnv({ ...process.env, CPF_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/CPF_ENCRYPTION_KEY/);
  });

  it('proíbe provider mock e cookie inseguro em produção', () => {
    expect(() =>
      parseEnv({ ...process.env, NODE_ENV: 'production', PATIENT_PROVIDER: 'mock' }),
    ).toThrow(/PATIENT_PROVIDER/);
    expect(() =>
      parseEnv({
        ...process.env,
        NODE_ENV: 'production',
        PATIENT_PROVIDER: 'none',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });
});
