import { describe, expect, it } from 'vitest';
import { passwordPolicyIssues } from './password-policy.js';

describe('passwordPolicyIssues', () => {
  it('aceita senha longa e não óbvia', () => {
    expect(passwordPolicyIssues('cavalo-bateria-grampo-7')).toEqual([]);
  });

  it('exige comprimento mínimo configurável', () => {
    expect(passwordPolicyIssues('curta')).toHaveLength(1);
    expect(passwordPolicyIssues('abcdefghij', { minLength: 10 })).toEqual([]);
  });

  it('limita o tamanho máximo', () => {
    expect(passwordPolicyIssues('a1'.repeat(70))).toContain(
      'A senha deve ter no máximo 128 caracteres.',
    );
  });

  it('bloqueia repetição e senhas comuns', () => {
    expect(passwordPolicyIssues('aaaaaaaaaaaaa').length).toBeGreaterThan(0);
    expect(passwordPolicyIssues('Venancio1234').length).toBeGreaterThan(0);
  });

  it('bloqueia e-mail e nome na senha', () => {
    expect(passwordPolicyIssues('mariana-secreta-99', { email: 'mariana@x.com' })).toContain(
      'A senha não pode conter o seu e-mail.',
    );
    expect(passwordPolicyIssues('senha-do-roberto-1', { name: 'Roberto Silva' })).toContain(
      'A senha não pode conter o seu nome.',
    );
  });
});
