/**
 * Analytics (PRD §29). Interface com provider no-op por padrão (console em dev).
 * Payloads aceitam apenas categorias, contagens e tipos — nunca CPF, token, nome de
 * arquivo, conteúdo de receita ou outro dado pessoal. As chaves são fixadas por
 * evento no tipo `EventPayloads`, e `sanitize` descarta qualquer outra.
 */

type Entry = 'store_link' | 'generic' | 'personalized';

export interface EventPayloads {
  prescription_page_viewed: { entry: Entry };
  store_auto_identified: { entry: Entry };
  store_selected: { entry: Entry };
  cpf_entered: { entry: Entry };
  file_added: { entry: Entry; fileType: string };
  file_removed: { entry: Entry; fileType: string };
  file_validation_failed: { entry: Entry; reason: 'format' | 'too_large' | 'too_many' };
  recaptcha_completed: { entry: Entry };
  prescription_submit_started: { entry: Entry; fileCount: number };
  prescription_submit_succeeded: { entry: Entry; fileCount: number; durationMs: number };
  prescription_submit_failed: { entry: Entry; code: string };
  personalized_link_opened: Record<string, never>;
  personalized_link_invalid: Record<string, never>;
  personalized_link_upload_succeeded: Record<string, never>;
}

export type AnalyticsEvent = keyof EventPayloads;

export interface AnalyticsProvider {
  track(event: AnalyticsEvent, payload: Record<string, string | number>): void;
}

const ALLOWED_KEYS = new Set(['entry', 'fileType', 'reason', 'fileCount', 'durationMs', 'code']);
const SAFE_VALUE = /^[A-Za-z0-9_./-]{0,40}$/;

/** Remove chaves fora da allowlist e valores com formato inesperado (defesa extra). */
export function sanitize(payload: object): Record<string, string | number> {
  const output: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    else if (typeof value === 'string' && SAFE_VALUE.test(value)) output[key] = value;
  }
  return output;
}

const noopProvider: AnalyticsProvider = { track: () => undefined };

const consoleProvider: AnalyticsProvider = {
  track: (event, payload) => {
    // eslint-disable-next-line no-console -- provider de desenvolvimento
    console.debug('[analytics]', event, payload);
  },
};

let provider: AnalyticsProvider =
  process.env.NODE_ENV === 'development' ? consoleProvider : noopProvider;

/** Permite plugar um provider real (pendência: ferramenta de analytics não definida). */
export function setAnalyticsProvider(next: AnalyticsProvider): void {
  provider = next;
}

export function track<E extends AnalyticsEvent>(event: E, payload: EventPayloads[E]): void {
  try {
    provider.track(event, sanitize(payload));
  } catch {
    // Analytics nunca interrompe o fluxo do usuário.
  }
}
