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

  it('não permite scanner sintético fora dos testes', () => {
    expect(() =>
      parseEnv({ ...process.env, NODE_ENV: 'development', MALWARE_SCANNER_MODE: 'test-clean' }),
    ).toThrow(/MALWARE_SCANNER_MODE/);
  });

  it('proíbe provider mock e cookie inseguro em produção', () => {
    expect(() =>
      parseEnv({ ...process.env, NODE_ENV: 'production', PATIENT_PROVIDER: 'mock' }),
    ).toThrow(/PATIENT_PROVIDER/);
    expect(() =>
      parseEnv({
        ...process.env,
        NODE_ENV: 'production',
        PATIENT_PROVIDER: 'http',
        PATIENT_INTEGRATION_ENABLED: 'false',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('integração de pacientes: desligada por padrão; HTTP bloqueado até existir contrato', () => {
    const base = {
      ...process.env,
      PATIENT_INTEGRATION_ENABLED: undefined,
      PATIENT_PROVIDER: undefined,
      PATIENT_AUTO_IDENTIFICATION_ENABLED: undefined,
    };
    const env = parseEnv(base);
    expect(env.PATIENT_INTEGRATION_ENABLED).toBe(false);
    expect(env.PATIENT_PROVIDER).toBe('http');
    expect(() =>
      parseEnv({ ...base, PATIENT_INTEGRATION_ENABLED: 'true', PATIENT_PROVIDER: 'http' }),
    ).toThrow(/patients-api-checklist/);
  });

  it('descarte exige habilitação, aprovação e storage verificado', () => {
    const base = {
      ...process.env,
      RETENTION_EXECUTION_ENABLED: undefined,
      RETENTION_APPROVAL_REFERENCE: undefined,
      RETENTION_STORAGE_VERSIONING: undefined,
    };
    expect(parseEnv(base).RETENTION_EXECUTION_ENABLED).toBe(false);
    expect(() => parseEnv({ ...base, RETENTION_EXECUTION_ENABLED: 'true' })).toThrow(
      /RETENTION_APPROVAL_REFERENCE/,
    );
    expect(() =>
      parseEnv({
        ...base,
        RETENTION_EXECUTION_ENABLED: 'true',
        RETENTION_APPROVAL_REFERENCE: 'DPO-TESTE-001',
      }),
    ).toThrow(/RETENTION_STORAGE_VERSIONING/);
    expect(
      parseEnv({
        ...base,
        RETENTION_EXECUTION_ENABLED: 'true',
        RETENTION_APPROVAL_REFERENCE: 'DPO-TESTE-001',
        RETENTION_STORAGE_VERSIONING: 'disabled',
      }).RETENTION_EXECUTION_ENABLED,
    ).toBe(true);
  });
});
