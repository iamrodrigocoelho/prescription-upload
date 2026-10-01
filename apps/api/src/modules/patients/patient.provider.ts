/**
 * Dados de paciente vindos da API externa (contrato real pendente — PRD §27).
 * Ficam apenas em memória: o sistema persiste somente `externalId` e rótulos mascarados.
 */
export interface Patient {
  externalId: string;
  name: string;
  /** Somente dígitos. */
  cpf: string;
  phone: string | null;
  email: string | null;
}

/**
 * Abstração da API de pacientes (PRD §27). `findByExternalId` é uma extensão da
 * interface conceitual: necessária para validar, no backend, o paciente escolhido
 * na geração do link (nunca se confia no ID enviado pelo cliente).
 */
export abstract class PatientProvider {
  abstract findByCpf(cpf: string): Promise<Patient | null>;
  abstract searchByCpf(cpf: string): Promise<Patient[]>;
  abstract searchByPhone(phone: string): Promise<Patient[]>;
  abstract searchByEmail(email: string): Promise<Patient[]>;
  abstract findByExternalId(externalId: string): Promise<Patient | null>;
}
