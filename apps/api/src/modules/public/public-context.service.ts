import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  type PublicPatientLinkContext,
  type PublicStoreSearchItem,
  type PublicStoreView,
} from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PatientLinkAccessService } from '../patient-links/patient-link-access.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';

const SLUG_FORMAT = /^[0-9A-Za-z]{12}$/;
const MAX_SEARCH_RESULTS = 20;

/**
 * Resolução de contexto da área pública (PRD §6.1–§6.4, §26.1). Retorna apenas
 * dados de exibição; nenhuma informação de paciente.
 */
@Injectable()
export class PublicContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: PatientLinkAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Loja pelo slug público. Inexistente → 404 neutro; inativa → `acceptsSubmissions: false`. */
  async storeBySlug(slug: string): Promise<PublicStoreView> {
    const store = SLUG_FORMAT.test(slug)
      ? await this.prisma.store.findUnique({ where: { publicSlug: slug } })
      : null;
    if (!store) throw new AppError(ApiErrorCode.NOT_FOUND, 'Loja não encontrada.');
    return {
      storeNumber: store.storeNumber,
      storeName: store.storeName,
      acceptsSubmissions: storeAcceptsSubmissions(store),
    };
  }

  /** Busca de lojas ativas para a entrada genérica (PRD §6.3). */
  async searchStores(search: string): Promise<PublicStoreSearchItem[]> {
    const stores = await this.prisma.store.findMany({
      where: {
        active: true,
        OR: [
          { storeNumber: { contains: search, mode: 'insensitive' } },
          { storeName: { contains: search, mode: 'insensitive' } },
          { neighborhood: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
        ],
      },
      orderBy: { storeNumber: 'asc' },
      take: MAX_SEARCH_RESULTS,
      select: { id: true, storeNumber: true, storeName: true, neighborhood: true, city: true },
    });
    return stores;
  }

  /**
   * Contexto do link personalizado. Usa a validação da Fase 1 (erro neutro único,
   * CA-014) e audita a abertura sem registrar o token (PRD §17.5).
   */
  async patientLinkContext(token: string): Promise<PublicPatientLinkContext & { linkId: string }> {
    const link = await this.links.resolve(token);
    await this.audit.record({
      action: AuditAction.PATIENT_LINK_OPENED,
      entityType: 'PatientUploadLink',
      entityId: link.linkId,
      storeId: link.storeId,
      actor: { userId: null, role: null },
    });
    return { linkId: link.linkId, storeNumber: link.storeNumber, storeName: link.storeName };
  }

  /** Contexto a partir do cookie (o link é revalidado a cada chamada). */
  async patientLinkContextById(linkId: string): Promise<PublicPatientLinkContext> {
    const link = await this.links.resolveById(linkId);
    return { storeNumber: link.storeNumber, storeName: link.storeName };
  }
}
