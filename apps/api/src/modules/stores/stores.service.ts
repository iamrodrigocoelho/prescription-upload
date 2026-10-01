import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  type CreateStoreInput,
  type ListStoresQuery,
  type Paginated,
  type StoreImportReport,
  type StoreView,
  type UpdateStoreInput,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { Prisma, type Store } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { parseStoresCsv } from './store-csv.parser.js';
import { generateStoreSlug } from './store-slug.js';

const EDITABLE_FIELDS = [
  'storeName',
  'active',
  'address',
  'neighborhood',
  'city',
  'state',
] as const;

/** Lojas inativas não aceitam novos envios (PRD §16.3, CA-010). */
export function storeAcceptsSubmissions(store: Pick<Store, 'active'>): boolean {
  return store.active;
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StoreScopeService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  publicUrl(store: Pick<Store, 'publicSlug'>): string {
    return `${this.env.PUBLIC_APP_URL}/l/${store.publicSlug}`;
  }

  toView(store: Store): StoreView {
    return {
      id: store.id,
      storeNumber: store.storeNumber,
      storeName: store.storeName,
      active: store.active,
      address: store.address,
      neighborhood: store.neighborhood,
      city: store.city,
      state: store.state,
      publicUrl: this.publicUrl(store),
      createdAt: store.createdAt.toISOString(),
      updatedAt: store.updatedAt.toISOString(),
    };
  }

  async list(auth: AuthContext, query: ListStoresQuery): Promise<Paginated<StoreView>> {
    const where: Prisma.StoreWhereInput = {
      AND: [
        await this.scope.storeWhere(auth),
        query.active === undefined ? {} : { active: query.active },
        query.search
          ? {
              OR: [
                { storeNumber: { contains: query.search, mode: 'insensitive' } },
                { storeName: { contains: query.search, mode: 'insensitive' } },
                { neighborhood: { contains: query.search, mode: 'insensitive' } },
                { city: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [total, stores] = await this.prisma.$transaction([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: { storeNumber: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: stores.map((s) => this.toView(s)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Busca respeitando o escopo: loja de fora do escopo é indistinguível de inexistente. */
  async getScoped(auth: AuthContext, id: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({
      where: { AND: [{ id }, await this.scope.storeWhere(auth)] },
    });
    if (!store) throw new AppError(ApiErrorCode.NOT_FOUND);
    return store;
  }

  async create(input: CreateStoreInput): Promise<StoreView> {
    try {
      const store = await this.prisma.$transaction(async (tx) => {
        const created = await tx.store.create({
          data: { ...input, publicSlug: generateStoreSlug() },
        });
        await this.audit.record(
          {
            action: AuditAction.STORE_CREATED,
            entityType: 'Store',
            entityId: created.id,
            storeId: created.id,
            metadata: { storeNumber: created.storeNumber },
          },
          tx,
        );
        return created;
      });
      return this.toView(store);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ApiErrorCode.CONFLICT, 'Já existe uma loja com este número.');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateStoreInput): Promise<StoreView> {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new AppError(ApiErrorCode.NOT_FOUND);

    const changed = EDITABLE_FIELDS.filter(
      (field) => input[field] !== undefined && input[field] !== store[field],
    );
    if (changed.length === 0) return this.toView(store);

    const data = Object.fromEntries(changed.map((field) => [field, input[field]]));
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.store.update({ where: { id }, data });
      await this.audit.record(
        {
          action: AuditAction.STORE_UPDATED,
          entityType: 'Store',
          entityId: id,
          storeId: id,
          metadata: {
            fields: changed,
            ...(changed.includes('active')
              ? { active: { from: store.active, to: saved.active } }
              : {}),
          },
        },
        tx,
      );
      return saved;
    });
    return this.toView(updated);
  }

  /**
   * Importação por CSV (PRD §16.1–16.3): upsert por `store_number`, sem duplicar.
   * Linhas válidas são aplicadas em uma única transação; inválidas vão para o relatório.
   */
  async import(content: string, dryRun: boolean): Promise<StoreImportReport> {
    const parsed = parseStoresCsv(content);
    const existing = await this.prisma.store.findMany({
      where: { storeNumber: { in: parsed.rows.map((row) => row.storeNumber) } },
    });
    const byNumber = new Map(existing.map((store) => [store.storeNumber, store]));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const toCreate: typeof parsed.rows = [];
    const toUpdate: { id: string; data: Prisma.StoreUpdateInput }[] = [];

    for (const row of parsed.rows) {
      const { line: _line, storeNumber, ...fields } = row;
      const current = byNumber.get(storeNumber);
      if (!current) {
        created += 1;
        toCreate.push(row);
        continue;
      }
      const diff = EDITABLE_FIELDS.filter((field) => fields[field] !== current[field]);
      if (diff.length === 0) {
        unchanged += 1;
      } else {
        updated += 1;
        toUpdate.push({
          id: current.id,
          data: Object.fromEntries(diff.map((f) => [f, fields[f]])),
        });
      }
    }

    const report: StoreImportReport = {
      dryRun,
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      created,
      updated,
      unchanged,
      errors: parsed.errors,
    };
    if (dryRun) return report;

    await this.prisma.$transaction(
      async (tx) => {
        for (const { line: _line, ...row } of toCreate) {
          await tx.store.create({ data: { ...row, publicSlug: generateStoreSlug() } });
        }
        for (const { id, data } of toUpdate) {
          await tx.store.update({ where: { id }, data });
        }
        await this.audit.record(
          {
            action: AuditAction.STORE_IMPORTED,
            entityType: 'Store',
            metadata: {
              totalRows: report.totalRows,
              created,
              updated,
              unchanged,
              invalidRows: new Set(parsed.errors.map((e) => e.line)).size,
            },
          },
          tx,
        );
      },
      { timeout: 60_000 },
    );
    return report;
  }
}
