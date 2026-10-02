import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  type CpfRevealResponse,
  type FileUrlQuery,
  formatCpf,
  type SignedFileUrl,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { AuditService } from '../audit/audit.service.js';
import { PrescriptionsService } from './prescriptions.service.js';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

/**
 * Anexos (PRD §9.4, §13.1, §13.2) e revelação de CPF (§13, D-056). Toda URL é
 * gerada só depois de checar o escopo da receita E o vínculo arquivo↔receita.
 */
@Injectable()
export class PrescriptionFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescriptions: PrescriptionsService,
    private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly rateLimit: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async signedUrl(
    auth: AuthContext,
    submissionId: string,
    fileId: string,
    mode: 'view' | 'download',
    variant: FileUrlQuery['variant'] = 'original',
  ): Promise<SignedFileUrl> {
    const submission = await this.prescriptions.findScoped(auth, submissionId);
    // IDOR: o arquivo precisa pertencer à receita (que já passou pelo escopo).
    const file = await this.prisma.prescriptionFile.findFirst({
      where: { id: fileId, submissionId },
    });
    if (!file) throw new AppError(ApiErrorCode.NOT_FOUND);
    if (file.malwareScanStatus === 'INFECTED') {
      throw new AppError(
        ApiErrorCode.FORBIDDEN,
        'Este arquivo foi bloqueado pela verificação de segurança.',
      );
    }

    let key = file.storageKey;
    let contentType = file.mimeType;
    if (mode === 'view' && variant === 'preview') {
      if (file.previewStorageKey) {
        key = file.previewStorageKey;
        contentType = file.previewMimeType ?? 'image/jpeg';
      } else if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimeType)) {
        throw new AppError(
          ApiErrorCode.NOT_FOUND,
          'Pré-visualização indisponível. Use o download.',
        );
      }
    }
    if (mode === 'view' && variant === 'thumbnail') {
      if (!file.thumbnailStorageKey)
        throw new AppError(ApiErrorCode.NOT_FOUND, 'Miniatura indisponível.');
      key = file.thumbnailStorageKey;
      contentType = 'image/jpeg';
    }

    const effectiveVariant = mode === 'download' ? 'original' : variant;
    // Nome genérico: o nome original não vai para a URL (que pode ir a históricos/proxies).
    const filename = `receita-${submission.id.slice(0, 8)}-${file.position}.${EXTENSION[contentType] ?? 'bin'}`;
    const ttl = this.env.SIGNED_URL_TTL_SECONDS;
    const url = await this.storage.getSignedUrl(key, {
      disposition: mode === 'view' ? 'inline' : 'attachment',
      filename,
      contentType,
      ttlSeconds: ttl,
    });

    await this.audit.record({
      action:
        mode === 'view'
          ? AuditAction.PRESCRIPTION_FILE_VIEWED
          : AuditAction.PRESCRIPTION_FILE_DOWNLOADED,
      entityType: 'PrescriptionFile',
      entityId: file.id,
      storeId: submission.storeId,
      metadata: {
        submissionId: submission.id,
        filePosition: file.position,
        variant: effectiveVariant,
      },
    });
    return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  /** Revela o CPF completo uma única vez por chamada; sempre auditado e limitado por usuário. */
  async revealCpf(auth: AuthContext, submissionId: string): Promise<CpfRevealResponse> {
    const submission = await this.prescriptions.findScoped(auth, submissionId);
    if (!submission.cpfEncrypted)
      throw new AppError(ApiErrorCode.NOT_FOUND, 'CPF não informado neste envio.');
    await this.rateLimit.consume('cpfRevealUser', auth.user.id);
    const cpf = this.crypto.decryptCpf(submission.cpfEncrypted);
    await this.audit.record({
      action: AuditAction.PRESCRIPTION_CPF_REVEALED,
      entityType: 'PrescriptionSubmission',
      entityId: submission.id,
      storeId: submission.storeId,
    });
    return { cpf: formatCpf(cpf) };
  }
}
