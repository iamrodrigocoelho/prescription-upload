import type { ListPrescriptionsQuery } from '@receita/shared';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Traduz os filtros da fila (PRD §12.3) para `where`. O escopo de loja é SEMPRE
 * combinado com AND por quem chama — nenhum filtro consegue ampliá-lo.
 */
export function prescriptionFilterWhere(
  scope: { storeId?: { in: string[] } },
  query: Pick<
    ListPrescriptionsQuery,
    | 'storeId'
    | 'from'
    | 'to'
    | 'operationalStatus'
    | 'identificationStatus'
    | 'sourceChannel'
    | 'hasCpf'
    | 'unviewed'
    | 'linked'
  >,
): Prisma.PrescriptionSubmissionWhereInput {
  const and: Prisma.PrescriptionSubmissionWhereInput[] = [
    scope,
    { disposedAt: null, disposalStartedAt: null },
  ];
  if (query.storeId) and.push({ storeId: query.storeId });
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    });
  }
  if (query.operationalStatus) and.push({ operationalStatus: { in: query.operationalStatus } });
  if (query.identificationStatus)
    and.push({ identificationStatus: { in: query.identificationStatus } });
  if (query.sourceChannel) and.push({ sourceChannel: { in: query.sourceChannel } });
  if (query.hasCpf !== undefined) {
    and.push({ cpfHashForLookup: query.hasCpf ? { not: null } : null });
  }
  if (query.unviewed !== undefined) {
    and.push({ firstViewedAt: query.unviewed ? null : { not: null } });
  }
  if (query.linked !== undefined) {
    and.push({ patientExternalId: query.linked ? { not: null } : null });
  }
  return { AND: and };
}
