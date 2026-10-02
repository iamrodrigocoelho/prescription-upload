/**
 * Regras de habilitação do botão Enviar (PRD §10.1, RF-011, DESIGN §6.6).
 * O backend revalida tudo; isto é apenas conveniência de interface.
 */
export interface SubmitState {
  /** Arquivos na lista (todos válidos no cliente) e se algum foi marcado com erro pelo servidor. */
  fileCount: number;
  hasFileErrors: boolean;
  /** Loja definida e aceitando envios (ou contexto de link resolvido). */
  contextReady: boolean;
  /** CPF: `null` quando o campo não existe (link personalizado). */
  cpf: { value: string; valid: boolean } | null;
  captchaToken: string | null;
  submitting: boolean;
}

export type BlockReason = 'files' | 'context' | 'cpf' | 'captcha' | 'submitting';

export function submitBlockers(state: SubmitState): BlockReason[] {
  const reasons: BlockReason[] = [];
  if (state.fileCount < 1 || state.hasFileErrors) reasons.push('files');
  if (!state.contextReady) reasons.push('context');
  if (state.cpf && state.cpf.value.trim() !== '' && !state.cpf.valid) reasons.push('cpf');
  if (!state.captchaToken) reasons.push('captcha');
  if (state.submitting) reasons.push('submitting');
  return reasons;
}

export function canSubmit(state: SubmitState): boolean {
  return submitBlockers(state).length === 0;
}
