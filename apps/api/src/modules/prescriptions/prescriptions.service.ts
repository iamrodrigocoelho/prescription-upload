import { Injectable } from '@nestjs/common';
import {
  type ListPrescriptionsQuery,
  maskCpf,
  type PrescriptionCounters,
  type PrescriptionCountersQuery,
  type PrescriptionListItem,
  type PrescriptionListResponse,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { prescriptionFilterWhere } from './prescription-filters.js';

const listSelect = {
  id: true,
  createdAt: true,
  operationalStatus: true,
  identificationStatus: true,
  sourceChannel: true,
  cpfEncrypted: true,
  patientDisplayLabel: true,
  firstViewedAt: true,
  store: { select: { id: true, storeNumber: true, storeName: true } },
  _count: { select: { files: true } },
} satisfies Prisma.PrescriptionSubmissionSelect;

/** Fila de receitas (PRD §12) com escopo de loja aplicado na consulta (CA-007). */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StoreScopeService,
    private readonly crypto: CryptoService,
  ) {}

  /** CPF mascarado a partir do valor cifrado; nunca devolve o CPF integral. */
  maskedCpf(cpfEncrypted: string | null): string | null {
    return cpfEncrypted ? maskCpf(this.crypto.decryptCpf(cpfEncrypted)) : null;
  }

  async list(auth: AuthContext, query: ListPrescriptionsQuery): Promise<PrescriptionListResponse> {
    const base = prescriptionFilterWhere(await this.scope.storeIdWhere(auth), query);
    const desc = query.sort === 'desc';
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const where: Prisma.PrescriptionSubmissionWhereInput = cursor
      ? {
          AND: [
            base,
            {
              OR: [
                { createdAt: desc ? { lt: cursor.createdAt } : { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: desc ? { lt: cursor.id } : { gt: cursor.id } },
              ],
            },
          ],
        }
      : base;

    const rows = await this.prisma.prescriptionSubmission.findMany({
      where,
      select: listSelect,
      orderBy: [{ createdAt: query.sort }, { id: query.sort }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row): PrescriptionListItem => ({
        id: row.id,
        receivedAt: row.createdAt.toISOString(),
        store: row.store,
        operationalStatus: row.operationalStatus,
        identificationStatus: row.identificationStatus,
        cpfMasked: this.maskedCpf(row.cpfEncrypted),
        patientLabel: row.patientDisplayLabel,
        fileCount: row._count.files,
        isNew: row.firstViewedAt === null,
        sourceChannel: row.sourceChannel,
      })),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async counters(
    auth: AuthContext,
    query: PrescriptionCountersQuery,
  ): Promise<PrescriptionCounters> {
    const base = prescriptionFilterWhere(await this.scope.storeIdWhere(auth), query);
    const count = (extra: Prisma.PrescriptionSubmissionWhereInput) =>
      this.prisma.prescriptionSubmission.count({ where: { AND: [base, extra] } });
    const [fresh, unidentified, inService, finished] = await Promise.all([
      count({ firstViewedAt: null }),
      count({ identificationStatus: 'NOT_IDENTIFIED' }),
      count({ operationalStatus: 'IN_SERVICE' }),
      count({ operationalStatus: 'FINISHED' }),
    ]);
    return { new: fresh, unidentified, inService, finished };
  }
}
