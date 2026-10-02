import { describe, expect, it } from 'vitest';
import { canSubmit, type SubmitState, submitBlockers } from './can-submit';

const ready: SubmitState = {
  fileCount: 1,
  hasFileErrors: false,
  contextReady: true,
  cpf: { value: '', valid: false },
  captchaToken: 'token',
  submitting: false,
};

describe('canSubmit', () => {
  it('habilita com 1 arquivo, contexto pronto, CPF vazio e captcha concluído', () => {
    expect(canSubmit(ready)).toBe(true);
  });

  it('CA-003: desabilitado sem captcha', () => {
    expect(canSubmit({ ...ready, captchaToken: null })).toBe(false);
    expect(submitBlockers({ ...ready, captchaToken: null })).toEqual(['captcha']);
  });

  it('desabilitado sem arquivos ou com arquivo marcado com erro', () => {
    expect(submitBlockers({ ...ready, fileCount: 0 })).toEqual(['files']);
    expect(submitBlockers({ ...ready, hasFileErrors: true })).toEqual(['files']);
  });

  it('desabilitado com loja indefinida/indisponível ou link inválido', () => {
    expect(submitBlockers({ ...ready, contextReady: false })).toEqual(['context']);
  });

  it('CPF é opcional, mas quando preenchido precisa ser válido', () => {
    expect(canSubmit({ ...ready, cpf: { value: '529.982.247-25', valid: true } })).toBe(true);
    expect(submitBlockers({ ...ready, cpf: { value: '123', valid: false } })).toEqual(['cpf']);
  });

  it('link personalizado não tem campo CPF', () => {
    expect(canSubmit({ ...ready, cpf: null })).toBe(true);
  });

  it('desabilitado durante o envio', () => {
    expect(submitBlockers({ ...ready, submitting: true })).toEqual(['submitting']);
  });
});
