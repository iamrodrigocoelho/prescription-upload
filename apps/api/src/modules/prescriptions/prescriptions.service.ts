import { Injectable } from '@nestjs/common';
import {
  allowedTransitions,
  ApiErrorCode,
  AuditAction,
  type PrescriptionDetail,
  type PrescriptionFileView,
  type ListPrescriptionsQuery,
  maskCpf,
  type PrescriptionCounters,
  type PrescriptionCountersQuery,
  type PrescriptionListItem,
  type PrescriptionListResponse,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { prescriptionFilterWhere } from './prescription-filters.js';
import { buildTimeline } from './timeline.js';

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
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Busca uma receita respeitando o escopo. Fora do escopo é indistinguível de
   * inexistente: 404 (CA-007).
   */
  async findScoped<T extends Prisma.PrescriptionSubmissionInclude>(
    auth: AuthContext,
    id: string,
    include?: T,
  ): Promise<Prisma.PrescriptionSubmissionGetPayload<{ include: T }>> {
    const submission = await this.prisma.prescriptionSubmission.findFirst({
      where: { AND: [{ id }, await this.scope.storeIdWhere(auth)] },
      include,
    });
    if (!submission) throw new AppError(ApiErrorCode.NOT_FOUND);
    return submission as Prisma.PrescriptionSubmissionGetPayload<{ include: T }>;
  }

  /**
   * Detalhe (PRD §13). Toda abertura é auditada; a primeira visualização é
   * registrada de forma atômica (update condicional) e gera evento de tempo real.
   */
  async detail(auth: AuthContext, id: string): Promise<PrescriptionDetail> {
    const submission = await this.findScoped(auth, id, {
      store: { select: { id: true, storeNumber: true, storeName: true } },
      files: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
        include: { changedBy: { select: { name: true } } },
      },
      patientLinkHistory: {
        orderBy: { createdAt: 'asc' },
        include: { linkedBy: { select: { name: true } } },
      },
    });

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const first = await tx.prescriptionSubmission.updateMany({
        where: { id, firstViewedAt: null },
        data: { firstViewedAt: now },
      });
      if (first.count === 1) {
        await this.audit.record(
          {
            action: AuditAction.PRESCRIPTION_FIRST_VIEWED,
            entityType: 'PrescriptionSubmission',
            entityId: id,
            storeId: submission.storeId,
          },
          tx,
        );
        await this.outbox.add(tx, 'prescription.viewed', {
          submissionId: id,
          storeId: submission.storeId,
        });
      }
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_OPENED,
          entityType: 'PrescriptionSubmission',
          entityId: id,
          storeId: submission.storeId,
        },
        tx,
      );
    });

    const fileIds = submission.files.map((file) => file.id);
    const audits = await this.prisma.auditLog.findMany({
      where: {
        entityId: { in: [id, ...fileIds] },
        action: {
          in: [
            AuditAction.PRESCRIPTION_FIRST_VIEWED,
            AuditAction.PRESCRIPTION_FILE_VIEWED,
            AuditAction.PRESCRIPTION_FILE_DOWNLOADED,
            AuditAction.PRESCRIPTION_CPF_REVEALED,
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        createdAt: true,
        action: true,
        entityId: true,
        actorUserId: true,
        metadata: true,
      },
    });
    const actorIds = [
      ...new Set(audits.map((a) => a.actorUserId).filter((v): v is string => Boolean(v))),
    ];
    const actors = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      ).map((user) => [user.id, user.name]),
    );

    return {
      id: submission.id,
      receivedAt: submission.createdAt.toISOString(),
      store: submission.store,
      operationalStatus: submission.operationalStatus,
      identificationStatus: submission.identificationStatus,
      sourceChannel: submission.sourceChannel,
      cpfMasked: this.maskedCpf(submission.cpfEncrypted),
      patientLabel: submission.patientDisplayLabel,
      version: submission.version,
      allowedTransitions: allowedTransitions(submission.operationalStatus, auth.user.role),
      files: submission.files.map((file) => this.fileView(file)),
      timeline: buildTimeline({
        receivedAt: submission.createdAt,
        fileIds,
        statusHistory: submission.statusHistory.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          actorName: row.changedBy?.name ?? null,
        })),
        patientLinks: submission.patientLinkHistory.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          linkType: row.linkType,
          actorName: row.linkedBy?.name ?? null,
        })),
        audits: audits.map((row) => ({
          ...row,
          actorName: row.actorUserId ? (actors.get(row.actorUserId) ?? null) : null,
        })),
      }),
    };
  }

  fileView(file: Prisma.PrescriptionFileGetPayload<object>): PrescriptionFileView {
    return {
      id: file.id,
      position: file.position,
      kind: file.mimeType === 'application/pdf' ? 'pdf' : 'image',
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      malwareScanStatus: file.malwareScanStatus,
      accessible: file.malwareScanStatus !== 'INFECTED',
      previewAvailable:
        file.previewStorageKey !== null || ['image/jpeg', 'image/png'].includes(file.mimeType),
      thumbnailAvailable: file.thumbnailStorageKey !== null,
    };
  }

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
