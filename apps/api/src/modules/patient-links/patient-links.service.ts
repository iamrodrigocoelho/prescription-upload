import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  type CreatePatientLinkInput,
  type CreatePatientLinkResponse,
  deriveLinkStatus,
  type ListPatientLinksQuery,
  type Paginated,
  PATIENT_LINK_EXPIRY_OPTIONS,
  type PatientLinkOptions,
  type PatientLinkView,
  PatientUploadLinkStatus,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { PatientSelectionService } from '../patients/patient-selection.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';
import { generatePatientLinkToken } from './patient-link-token.js';

const linkInclude = {
  store: { select: { id: true, storeNumber: true, storeName: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PatientUploadLinkInclude;

type LinkWithRelations = Prisma.PatientUploadLinkGetPayload<{ include: typeof linkInclude }>;

const DAY_MS = 86_400_000;

function toView(link: LinkWithRelations, now = new Date()): PatientLinkView {
  return {
    id: link.id,
    store: link.store,
    patientLabel: link.patientDisplayLabel,
    createdBy: link.createdBy,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    status: deriveLinkStatus(link, now),
    usedAt: link.usedAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
  };
}

/** Filtro de banco equivalente ao status derivado. */
function statusWhere(
  status: PatientUploadLinkStatus,
  now: Date,
): Prisma.PatientUploadLinkWhereInput {
  switch (status) {
    case PatientUploadLinkStatus.ACTIVE:
      return { status: 'ACTIVE', expiresAt: { gt: now } };
    case PatientUploadLinkStatus.EXPIRED:
      return { status: 'ACTIVE', expiresAt: { lte: now } };
    default:
      return { status };
  }
}

/** Links personalizados por paciente + loja (PRD §6.4, §17). */
@Injectable()
export class PatientLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StoreScopeService,
    private readonly settings: SettingsService,
    private readonly selections: PatientSelectionService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async options(): Promise<PatientLinkOptions> {
    const settings = await this.settings.getAll();
    const max = settings.patient_link_max_expiry_days;
    return {
      defaultExpiryDays: settings.patient_link_default_expiry_days,
      maxExpiryDays: max,
      expiryOptions: PATIENT_LINK_EXPIRY_OPTIONS.filter((days) => days <= max),
    };
  }

  /**
   * Gera o link. O token é criado exclusivamente aqui, persistido só como hash e
   * devolvido uma única vez na URL; loja e paciente são validados no backend.
   */
  async create(
    auth: AuthContext,
    input: CreatePatientLinkInput,
  ): Promise<CreatePatientLinkResponse> {
    const store = await this.scope.assertStoreInScope(auth, input.storeId);
    if (!storeAcceptsSubmissions(store)) {
      throw new AppError(ApiErrorCode.CONFLICT, 'Esta loja não está disponível para novos envios.');
    }

    const settings = await this.settings.getAll();
    const days = input.expiresInDays ?? settings.patient_link_default_expiry_days;
    if (days > settings.patient_link_max_expiry_days) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        {
          path: 'expiresInDays',
          message: `A validade máxima é de ${settings.patient_link_max_expiry_days} dias.`,
        },
      ]);
    }

    // O paciente vem da seleção feita na busca deste contexto (D-069), nunca do cliente.
    const selection = await this.selections.resolve(auth, input.selectionRef, {
      storeId: store.id,
    });

    const { token, tokenHash } = generatePatientLinkToken();
    const expiresAt = new Date(Date.now() + days * DAY_MS);

    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patientUploadLink.create({
        data: {
          storeId: store.id,
          patientExternalId: selection.patientExternalId,
          patientDisplayLabel: selection.patientDisplayLabel,
          tokenHash,
          createdByUserId: auth.user.id,
          expiresAt,
        },
        include: linkInclude,
      });
      await this.audit.record(
        {
          action: AuditAction.PATIENT_LINK_CREATED,
          entityType: 'PatientUploadLink',
          entityId: created.id,
          storeId: store.id,
          metadata: {
            patientExternalId: selection.patientExternalId,
            expiresInDays: days,
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return created;
    });
    await this.selections.consume(selection);

    return { link: toView(link), url: `${this.env.PUBLIC_APP_URL}/p/${token}` };
  }

  async list(auth: AuthContext, query: ListPatientLinksQuery): Promise<Paginated<PatientLinkView>> {
    const now = new Date();
    const where: Prisma.PatientUploadLinkWhereInput = {
      AND: [
        await this.scope.storeIdWhere(auth),
        query.storeId ? { storeId: query.storeId } : {},
        query.status ? statusWhere(query.status, now) : {},
      ],
    };
    const [total, links] = await this.prisma.$transaction([
      this.prisma.patientUploadLink.count({ where }),
      this.prisma.patientUploadLink.findMany({
        where,
        include: linkInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: links.map((link) => toView(link, now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async revoke(auth: AuthContext, id: string): Promise<PatientLinkView> {
    const link = await this.prisma.patientUploadLink.findFirst({
      where: { AND: [{ id }, await this.scope.storeIdWhere(auth)] },
    });
    if (!link) throw new AppError(ApiErrorCode.NOT_FOUND);

    const now = new Date();
    const revoked = await this.prisma.$transaction(async (tx) => {
      // Condicional: só revoga se ainda estiver ativo e dentro da validade.
      const result = await tx.patientUploadLink.updateMany({
        where: { id, status: 'ACTIVE', expiresAt: { gt: now } },
        data: { status: 'REVOKED', revokedAt: now, revokedByUserId: auth.user.id },
      });
      if (result.count !== 1) {
        throw new AppError(ApiErrorCode.CONFLICT, 'Este link não está mais ativo.');
      }
      await this.audit.record(
        {
          action: AuditAction.PATIENT_LINK_REVOKED,
          entityType: 'PatientUploadLink',
          entityId: id,
          storeId: link.storeId,
        },
        tx,
      );
      return tx.patientUploadLink.findUniqueOrThrow({ where: { id }, include: linkInclude });
    });
    return toView(revoked, now);
  }
}
