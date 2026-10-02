import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, AuditAction, AuditResult } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { AuditService } from '../audit/audit.service.js';

const RETRY_AFTER_MS = 10 * 60 * 1000;

/** Descarte reversível até apagar objetos; falhas ficam marcadas para retry. */
@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async report(limit = 100, now = new Date()): Promise<{ id: string; fileCount: number }[]> {
    const rows = await this.prisma.prescriptionSubmission.findMany({
      where: {
        retentionUntil: { lte: now },
        disposedAt: null,
        disposalStartedAt: null,
        legalHoldAt: null,
      },
      select: { id: true, _count: { select: { files: true } } },
      orderBy: [{ retentionUntil: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((row) => ({ id: row.id, fileCount: row._count.files }));
  }

  async setLegalHold(
    id: string,
    enabled: boolean,
    actorUserId: string,
  ): Promise<{ enabled: boolean }> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.prescriptionSubmission.findUnique({
        where: { id },
        select: { storeId: true, legalHoldAt: true, disposedAt: true, disposalStartedAt: true },
      });
      if (!row) throw new AppError(ApiErrorCode.NOT_FOUND);
      if (row.disposedAt || row.disposalStartedAt) throw new AppError(ApiErrorCode.CONFLICT);
      if (Boolean(row.legalHoldAt) === enabled) return;
      const changed = await tx.prescriptionSubmission.updateMany({
        where: {
          id,
          disposedAt: null,
          disposalStartedAt: null,
          legalHoldAt: enabled ? null : { not: null },
        },
        data: {
          legalHoldAt: enabled ? new Date() : null,
          legalHoldByUserId: enabled ? actorUserId : null,
        },
      });
      if (changed.count !== 1) throw new AppError(ApiErrorCode.CONFLICT);
      await this.audit.record(
        {
          action: enabled
            ? AuditAction.PRESCRIPTION_LEGAL_HOLD_ENABLED
            : AuditAction.PRESCRIPTION_LEGAL_HOLD_DISABLED,
          entityType: 'PrescriptionSubmission',
          entityId: id,
          storeId: row.storeId,
        },
        tx,
      );
    });
    return { enabled };
  }

  /** O CLI só chama este método com --apply; a configuração também deve autorizar. */
  async execute(
    limit = 100,
    retry = false,
    now = new Date(),
  ): Promise<{ disposed: string[]; failed: string[] }> {
    if (!this.env.RETENTION_EXECUTION_ENABLED || !this.env.RETENTION_APPROVAL_REFERENCE) {
      throw new Error('Descarte bloqueado: aprovação do Jurídico/DPO ausente');
    }
    if (this.env.RETENTION_STORAGE_VERSIONING !== 'disabled') {
      throw new Error(
        'Descarte bloqueado: versionamento do storage não verificado como desativado',
      );
    }
    const rows = await this.prisma.prescriptionSubmission.findMany({
      where: {
        retentionUntil: { lte: now },
        disposedAt: null,
        legalHoldAt: null,
        disposalStartedAt: retry ? { lt: new Date(now.getTime() - RETRY_AFTER_MS) } : null,
      },
      select: { id: true },
      orderBy: [{ retentionUntil: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    const disposed: string[] = [];
    const failed: string[] = [];
    for (const { id } of rows) {
      const claimed = await this.prisma.prescriptionSubmission.updateMany({
        where: {
          id,
          retentionUntil: { lte: now },
          disposedAt: null,
          legalHoldAt: null,
          disposalStartedAt: retry ? { lt: new Date(now.getTime() - RETRY_AFTER_MS) } : null,
        },
        data: { disposalStartedAt: now },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.disposeClaimed(id, now);
        disposed.push(id);
      } catch {
        // Não marca como descartado. O modo --retry retoma após dez minutos.
        await this.audit.recordSafely({
          action: AuditAction.PRESCRIPTION_DISPOSAL_FAILED,
          entityType: 'PrescriptionSubmission',
          entityId: id,
          result: AuditResult.FAILURE,
          actor: { userId: null, role: null },
          metadata: { approvalReference: this.env.RETENTION_APPROVAL_REFERENCE },
        });
        failed.push(id);
      }
    }
    return { disposed, failed };
  }

  private async disposeClaimed(id: string, now: Date): Promise<void> {
    const row = await this.prisma.prescriptionSubmission.findUniqueOrThrow({
      where: { id },
      select: {
        storeId: true,
        patientUploadLinkId: true,
        files: {
          select: {
            id: true,
            storageKey: true,
            previewStorageKey: true,
            thumbnailStorageKey: true,
            quarantineStorageKey: true,
          },
        },
      },
    });
    const keys = new Set(
      row.files.flatMap((file) =>
        [
          file.storageKey,
          file.previewStorageKey,
          file.thumbnailStorageKey,
          file.quarantineStorageKey,
        ].filter((key): key is string => Boolean(key)),
      ),
    );
    for (const key of keys) await this.storage.deleteObject(key);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.prescriptionSubmission.findUniqueOrThrow({
        where: { id },
        select: { legalHoldAt: true, disposedAt: true, disposalStartedAt: true },
      });
      if (current.legalHoldAt || current.disposedAt || !current.disposalStartedAt) {
        throw new AppError(ApiErrorCode.CONFLICT);
      }
      await tx.patientLinkHistory.deleteMany({ where: { submissionId: id } });
      await tx.prescriptionFile.deleteMany({ where: { submissionId: id } });
      if (row.patientUploadLinkId) {
        await tx.patientUploadLink.update({
          where: { id: row.patientUploadLinkId },
          data: {
            patientExternalId: '[DISPOSED]',
            patientDisplayLabel: 'Dados descartados',
            tokenHash: createHash('sha256').update(`disposed:${randomUUID()}`).digest('hex'),
            status: 'REVOKED',
            revokedAt: now,
          },
        });
      }
      await tx.prescriptionSubmission.update({
        where: { id },
        data: {
          cpfEncrypted: null,
          cpfHashForLookup: null,
          patientExternalId: null,
          patientDisplayLabel: null,
          patientLabelCapturedAt: null,
          idempotencyKey: null,
          disposedAt: now,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_DISPOSED,
          entityType: 'PrescriptionSubmission',
          entityId: id,
          storeId: row.storeId,
          metadata: {
            fileCount: row.files.length,
            fileIds: row.files.map((file) => file.id),
            objectCount: keys.size,
            approvalReference: this.env.RETENTION_APPROVAL_REFERENCE,
          },
          actor: { userId: null, role: null },
        },
        tx,
      );
    });
  }
}
