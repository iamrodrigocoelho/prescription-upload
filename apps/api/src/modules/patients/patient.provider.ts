/**
 * Resumo mínimo de paciente (PRD §8.2, §17.3): o ÚNICO formato que sai de um
 * adapter. Os campos pessoais já chegam mascarados; o restante do que a API
 * externa devolver é descartado dentro do adapter, nunca persistido nem logado.
 */
export interface PatientSummary {
  externalId: string;
  /** Nome abreviado ("João S."). */
  displayName: string;
  cpfMasked: string;
  phoneMasked: string | null;
  emailMasked: string | null;
}

/** Erros de domínio da integração (contrato real pendente — PRD §27). */
export type PatientProviderErrorKind = 'unavailable' | 'not_found' | 'invalid';

export class PatientProviderError extends Error {
  constructor(
    readonly kind: PatientProviderErrorKind,
    message = `Falha na integração de pacientes (${kind}).`,
  ) {
    super(message);
    this.name = 'PatientProviderError';
  }
}

/**
 * Abstração da API de pacientes (PRD §27). Entradas já normalizadas: CPF com 11
 * dígitos, telefone com DDD (10–11 dígitos, sem DDI) e e-mail em minúsculas.
 * Busca sem resultado devolve lista vazia (não lança `not_found`).
 */
export abstract class PatientProvider {
  abstract searchByCpf(cpf: string): Promise<PatientSummary[]>;
  abstract searchByPhone(phone: string): Promise<PatientSummary[]>;
  abstract searchByEmail(email: string): Promise<PatientSummary[]>;

  /**
   * Correspondência inequívoca (PRD §8.2): o paciente quando há exatamente um;
   * `null` quando não há nenhum ou há mais de um. Um adapter pode sobrescrever se
   * a API oferecer consulta exata por CPF.
   */
  async findByCpf(cpf: string): Promise<PatientSummary | null> {
    const results = await this.searchByCpf(cpf);
    return results.length === 1 ? results[0]! : null;
  }
}
