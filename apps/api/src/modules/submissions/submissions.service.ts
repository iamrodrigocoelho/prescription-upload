import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  isValidCpf,
  normalizeCpf,
  SourceChannel,
  type SubmissionResponse,
  SUBMISSION_MESSAGES,
} from '@receita/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../../common/errors.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { sha256Hex } from '../../infra/crypto/primitives.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { AuditService } from '../audit/audit.service.js';
import { CaptchaService } from '../captcha/captcha.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PatientLinkAccessService } from '../patient-links/patient-link-access.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { StorageCleanupService } from './storage-cleanup.service.js';
import { type ReceivedFile, receiveUpload } from './upload-receiver.js';

export type SubmissionEntry =
  | { type: 'public' }
  | { type: 'personalized'; token: string }
  /** Link personalizado via cookie de contexto (D-047): linkId já resolvido do cookie. */
  | { type: 'personalized-session'; linkId: string };

interface SubmissionContext {
  storeId: string;
  sourceChannel: SourceChannel;
  cpf?: string;
  link?: {
    linkId: string;
    patientExternalId: string;
    patientDisplayLabel: string;
    patientLabelCapturedAt: Date;
  };
}

const DAY_MS = 86_400_000;

/** Campos aceitos no envio público (loja/genérico). Qualquer outro → 400. */
const publicFieldsSchema = z
  .object({
    captchaToken: z.string().optional(),
    cpf: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => value === undefined || isValidCpf(value), SUBMISSION_MESSAGES.invalidCpf),
    slug: z
      .string()
      .regex(/^[0-9A-Za-z]{12}$/)
      .optional(),
    storeId: z.uuid().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.slug) !== Boolean(value.storeId), {
    message: 'Informe a loja.',
    path: ['storeId'],
  });

/** No link personalizado, loja e paciente vêm só do token (PRD §8.7). */
const PERSONALIZED_ALLOWED = new Set(['captchaToken']);

function validationError(error: z.ZodError): AppError {
  return new AppError(
    ApiErrorCode.VALIDATION_FAILED,
    undefined,
    error.issues.map((issue) => ({ path: issue.path.join('.') || 'body', message: issue.message })),
  );
}

/**
 * Recebimento público de receitas (PRD §7, §8, §9, §10.3). A validação do
 * frontend é conveniência: aqui tudo é revalidado.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly cleanup: StorageCleanupService,
    private readonly idempotency: IdempotencyService,
    private readonly captcha: CaptchaService,
    private readonly links: PatientLinkAccessService,
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly rateLimit: RateLimitService,
    private readonly outbox: OutboxService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  async submit(req: Request, entry: SubmissionEntry): Promise<SubmissionResponse> {
    const ip = req.ip;
    await this.rateLimit.consume('publicSubmitIp', ip ?? 'unknown');

    const scope =
      entry.type === 'public'
        ? 'public'
        : entry.type === 'personalized'
          ? `plink:${sha256Hex(entry.token)}`
          : `plink-id:${entry.linkId}`;
    const idem = await this.idempotency.begin(req.headers['idempotency-key'], scope);
    if (idem.kind === 'replay') {
      req.resume();
      return idem.response;
    }

    let context: SubmissionContext | undefined;
    let channel = entry.type === 'public' ? 'public' : SourceChannel.PERSONALIZED_LINK;
    try {
      const { files } = await receiveUpload(req, {
        storage: this.storage,
        beforeFiles: async (fields) => {
          context = await this.resolveContext(entry, fields, ip);
          channel = context.sourceChannel;
        },
        onFileRejected: (reason) => this.metrics.rejectedFiles.inc({ reason }),
        cleanup: (keys) => this.cleanup.removeObjects(keys, 'submission_upload_failed'),
      });
      if (!context) throw new AppError(ApiErrorCode.VALIDATION_FAILED);
      await this.persist(context, files, idem.kind === 'new' ? idem.keyHash : undefined);
      if (idem.kind === 'new') await this.idempotency.complete(idem.keyHash);
      this.metrics.submissions.inc({ channel, result: 'success' });
      return { status: 'RECEIVED' };
    } catch (error) {
      if (idem.kind === 'new') await this.idempotency.release(idem.keyHash);
      this.metrics.submissions.inc({
        channel,
        result: error instanceof AppError ? error.code.toLowerCase() : 'error',
      });
      throw error;
    }
  }

  /** Executado antes de qualquer byte de arquivo ser armazenado. */
  private async resolveContext(
    entry: SubmissionEntry,
    fields: Record<string, string>,
    ip: string | undefined,
  ): Promise<SubmissionContext> {
    if (entry.type !== 'public') {
      const forbidden = Object.keys(fields).filter((name) => !PERSONALIZED_ALLOWED.has(name));
      if (forbidden.length > 0) {
        this.metrics.securityEvents.inc({ type: 'personalized_link_tampering' });
        await this.audit.recordSafely({
          action: AuditAction.SECURITY_PERSONALIZED_LINK_TAMPERING,
          entityType: 'PatientUploadLink',
          result: AuditResult.DENIED,
          actor: { userId: null, role: null },
          metadata: { fields: forbidden.map((name) => name.slice(0, 40)).slice(0, 10) },
        });
        throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
          { path: 'body', message: 'Campos não permitidos neste envio.' },
        ]);
      }
      await this.captcha.assertValid(fields.captchaToken, ip);
      const link =
        entry.type === 'personalized'
          ? await this.links.resolve(entry.token)
          : await this.links.resolveById(entry.linkId);
      return {
        storeId: link.storeId,
        sourceChannel: SourceChannel.PERSONALIZED_LINK,
        link: {
          linkId: link.linkId,
          patientExternalId: link.patientExternalId,
          patientDisplayLabel: link.patientDisplayLabel,
          patientLabelCapturedAt: link.patientLabelCapturedAt,
        },
      };
    }

    const parsed = publicFieldsSchema.safeParse(fields);
    if (!parsed.success) throw validationError(parsed.error);
    await this.captcha.assertValid(parsed.data.captchaToken, ip);

    const store = await this.prisma.store.findUnique({
      where: parsed.data.slug ? { publicSlug: parsed.data.slug } : { id: parsed.data.storeId },
    });
    if (!store) throw new AppError(ApiErrorCode.NOT_FOUND, 'Loja não encontrada.');
    if (!storeAcceptsSubmissions(store)) throw new AppError(ApiErrorCode.STORE_UNAVAILABLE);
    return {
      storeId: store.id,
      sourceChannel: parsed.data.slug ? SourceChannel.STORE_LINK : SourceChannel.GENERIC,
      cpf: parsed.data.cpf ? normalizeCpf(parsed.data.cpf) : undefined,
    };
  }

  /**
   * Cria receita + arquivos + históricos + auditoria e consome o link, tudo numa
   * transação. Se falhar, os objetos já gravados são removidos.
   */
  private async persist(
    context: SubmissionContext,
    files: ReceivedFile[],
    idempotencyKey?: string,
  ): Promise<void> {
    const { retention_days: retentionDays } = await this.settings.getAll();
    let fileRows: { id: string; storageKey: string; mimeType: string }[];
    try {
      ({ fileRows } = await this.prisma.$transaction(async (tx) => {
        const createSubmission = () =>
          tx.prescriptionSubmission.create({
            data: {
              storeId: context.storeId,
              cpfEncrypted: context.cpf ? this.crypto.encryptCpf(context.cpf) : null,
              cpfHashForLookup: context.cpf ? this.crypto.cpfLookupHash(context.cpf) : null,
              operationalStatus: 'RECEIVED',
              identificationStatus: context.link
                ? 'IDENTIFIED_PERSONALIZED_LINK'
                : 'NOT_IDENTIFIED',
              patientExternalId: context.link?.patientExternalId ?? null,
              patientDisplayLabel: context.link?.patientDisplayLabel ?? null,
              patientLabelCapturedAt: context.link?.patientLabelCapturedAt ?? null,
              sourceChannel: context.sourceChannel,
              patientUploadLinkId: context.link?.linkId ?? null,
              idempotencyKey: idempotencyKey ?? null,
              retentionUntil: new Date(Date.now() + retentionDays * DAY_MS),
            },
          });
        // Uso único (RF-035): o link é reivindicado ANTES de criar a receita; se outro
        // envio consumiu antes, lança LINK_UNAVAILABLE e tudo é desfeito.
        const submission = context.link
          ? await this.links.consumeWithin(tx, context.link.linkId, createSubmission)
          : await createSubmission();
        const rows = await Promise.all(
          files.map((file, index) =>
            tx.prescriptionFile.create({
              data: {
                submissionId: submission.id,
                ...file,
                position: index + 1,
                malwareScanStatus: 'PENDING',
              },
              select: { id: true, storageKey: true, mimeType: true },
            }),
          ),
        );
        await tx.statusHistory.create({
          data: { submissionId: submission.id, fromStatus: null, toStatus: 'RECEIVED' },
        });
        if (context.link) {
          await tx.patientLinkHistory.create({
            data: {
              submissionId: submission.id,
              patientExternalId: context.link.patientExternalId,
              linkType: 'PERSONALIZED_LINK',
            },
          });
        }
        await this.audit.record(
          {
            action: AuditAction.PRESCRIPTION_SUBMITTED,
            entityType: 'PrescriptionSubmission',
            entityId: submission.id,
            storeId: context.storeId,
            actor: { userId: null, role: null },
            metadata: {
              sourceChannel: context.sourceChannel,
              fileCount: files.length,
              documentProvided: Boolean(context.cpf),
              identificationStatus: submission.identificationStatus,
              ...(context.link ? { patientLinkedVia: 'personalized_link' } : {}),
            },
          },
          tx,
        );
        // Varredura, derivados e tempo real: entregues pelo worker via outbox (D-054).
        await this.outbox.add(tx, 'prescription.submitted', {
          submissionId: submission.id,
          storeId: context.storeId,
        });
        return { fileRows: rows };
      }));
    } catch (error) {
      await this.cleanup.removeObjects(
        files.map((file) => file.storageKey),
        'submission_transaction_failed',
      );
      // A chave já existe no banco: envio idêntico concluído antes (Redis perdeu o estado).
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        JSON.stringify(error.meta ?? {}).includes('idempotency_key')
      ) {
        return;
      }
      throw error;
    }

    for (const file of fileRows) this.metrics.uploadedFiles.inc({ type: file.mimeType });
  }
}
