import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Adapter do Postgres com a sessão SEMPRE em UTC (D-078). O adapter envia `Date`
 * como timestamp sem fuso; com a sessão em outro fuso (ex.: America/Sao_Paulo),
 * o Postgres interpretaria o valor como hora local e gravaria o instante errado.
 */
export function createPgAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c TimeZone=UTC' });
}
