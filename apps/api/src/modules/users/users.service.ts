import { Injectable, Logger } from '@nestjs/common';
import {
  type AdminUserView,
  ApiErrorCode,
  AuditAction,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  Role,
  storeAssignmentIssue,
  type UpdateUserInput,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { RealtimeControl } from '../realtime/realtime-control.js';

const userInclude = {
  storeAccess: {
    include: { store: { select: { id: true, storeNumber: true, storeName: true } } },
    orderBy: { store: { storeNumber: 'asc' } },
  },
} satisfies Prisma.UserInclude;

type UserWithStores = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toView(user: UserWithStores): AdminUserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    totpEnabled: user.totpEnabled,
    totpRequired: user.totpRequired,
    pendingInvite: user.passwordHash === null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    stores: user.storeAccess.map(({ store }) => store),
  };
}

/** Gestão de usuários pelo Administrador (RF-026, RF-027). */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly control: RealtimeControl,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<AdminUserView>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: users.map(toView), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<AdminUserView> {
    return toView(await this.findOrThrow(id));
  }

  async create(input: CreateUserInput): Promise<AdminUserView & { inviteSent: boolean }> {
    this.assertStoreAssignment(input.role, input.storeIds);
    await this.assertStoresExist(input.storeIds);
    const totpRequired = input.totpRequired ?? input.role === Role.ADMIN;

    let created: UserWithStores;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            role: input.role,
            totpRequired,
            storeAccess: {
              create: input.storeIds.map((storeId) => ({
                storeId,
                createdByUserId: this.actorId(),
              })),
            },
          },
          include: userInclude,
        });
        await this.audit.record(
          {
            action: AuditAction.USER_CREATED,
            entityType: 'User',
            entityId: user.id,
            metadata: { role: input.role, storeIds: input.storeIds, totpRequired },
          },
          tx,
        );
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(ApiErrorCode.CONFLICT, 'Já existe um usuário com este e-mail.');
      }
      throw error;
    }

    return { ...toView(created), inviteSent: await this.trySendInvite(created) };
  }

  async update(auth: AuthContext, id: string, input: UpdateUserInput): Promise<AdminUserView> {
    const user = await this.findOrThrow(id);
    const isSelf = auth.user.id === id;

    if (isSelf && input.active === false) {
      throw new AppError(ApiErrorCode.FORBIDDEN, 'Você não pode desativar o seu próprio usuário.');
    }
    if (isSelf && input.role !== undefined && input.role !== user.role) {
      throw new AppError(ApiErrorCode.FORBIDDEN, 'Você não pode alterar o seu próprio perfil.');
    }

    const targetRole = input.role ?? user.role;
    const roleChanged = targetRole !== user.role;
    const currentStoreIds = user.storeAccess.map((access) => access.storeId);
    const nextStoreIds =
      input.storeIds ?? (roleChanged && targetRole === Role.ADMIN ? [] : currentStoreIds);
    if (roleChanged || input.storeIds) {
      this.assertStoreAssignment(targetRole, nextStoreIds);
      await this.assertStoresExist(nextStoreIds);
    }

    const losesAdmin =
      user.role === Role.ADMIN && user.active && (roleChanged || input.active === false);
    if (losesAdmin) await this.assertNotLastAdmin(id);

    const totpRequired =
      input.totpRequired ?? (roleChanged && targetRole === Role.ADMIN ? true : user.totpRequired);

    const data: Prisma.UserUpdateInput = {};
    const changedFields: string[] = [];
    if (input.name !== undefined && input.name !== user.name) {
      data.name = input.name;
      changedFields.push('name');
    }
    if (roleChanged) {
      data.role = targetRole;
      changedFields.push('role');
    }
    if (totpRequired !== user.totpRequired) {
      data.totpRequired = totpRequired;
      changedFields.push('totpRequired');
    }
    const activeChanged = input.active !== undefined && input.active !== user.active;
    if (activeChanged) data.active = input.active;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.user.update({ where: { id }, data });

      if (changedFields.length > 0) {
        await this.audit.record(
          {
            action: AuditAction.USER_UPDATED,
            entityType: 'User',
            entityId: id,
            metadata: {
              fields: changedFields,
              ...(roleChanged ? { role: { from: user.role, to: targetRole } } : {}),
              ...(changedFields.includes('totpRequired')
                ? { totpRequired: { from: user.totpRequired, to: totpRequired } }
                : {}),
            },
          },
          tx,
        );
      }

      if (activeChanged) {
        if (input.active === false) {
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date(), revokedReason: 'user_deactivated' },
          });
        }
        await this.audit.record(
          {
            action: input.active ? AuditAction.USER_ACTIVATED : AuditAction.USER_DEACTIVATED,
            entityType: 'User',
            entityId: id,
          },
          tx,
        );
      }

      if (roleChanged || input.storeIds) {
        await this.replaceStores(tx, id, currentStoreIds, nextStoreIds);
      }
    });

    // Desativação, perfil ou escopo alterados: streams de tempo real reconectam com o novo estado.
    if (activeChanged || roleChanged || input.storeIds) await this.control.invalidateUser(id);
    return this.get(id);
  }

  async setStores(id: string, storeIds: string[]): Promise<AdminUserView> {
    const user = await this.findOrThrow(id);
    this.assertStoreAssignment(user.role, storeIds);
    await this.assertStoresExist(storeIds);
    const current = user.storeAccess.map((access) => access.storeId);
    await this.prisma.$transaction((tx) => this.replaceStores(tx, id, current, storeIds));
    await this.control.invalidateUser(id);
    return this.get(id);
  }

  async revokeSessions(id: string): Promise<{ revoked: number }> {
    await this.findOrThrow(id);
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'admin_revoked' },
      });
      await this.audit.record(
        {
          action: AuditAction.AUTH_SESSIONS_REVOKED,
          entityType: 'User',
          entityId: id,
          metadata: { revoked: count },
        },
        tx,
      );
      return { revoked: count };
    });
    await this.control.invalidateUser(id);
    return result;
  }

  /** Para quem perdeu o autenticador: remove o 2FA e encerra as sessões. */
  async resetTotp(id: string): Promise<AdminUserView> {
    await this.findOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          totpEnabled: false,
          totpSecretEncrypted: null,
          totpPendingSecretEncrypted: null,
          totpLastUsedStep: null,
        },
      });
      await tx.totpRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'admin_revoked' },
      });
      await this.audit.record(
        { action: AuditAction.AUTH_TOTP_RESET_BY_ADMIN, entityType: 'User', entityId: id },
        tx,
      );
    });
    await this.control.invalidateUser(id);
    return this.get(id);
  }

  async resendInvite(id: string): Promise<{ inviteSent: boolean }> {
    const user = await this.findOrThrow(id);
    if (user.passwordHash !== null || !user.active) {
      throw new AppError(ApiErrorCode.CONFLICT, 'Este usuário não possui convite pendente.');
    }
    const inviteSent = await this.trySendInvite(user);
    await this.audit.record({
      action: AuditAction.USER_UPDATED,
      entityType: 'User',
      entityId: id,
      metadata: { fields: [], inviteResent: inviteSent },
    });
    return { inviteSent };
  }

  private async replaceStores(
    tx: Prisma.TransactionClient,
    userId: string,
    current: string[],
    next: string[],
  ): Promise<void> {
    const added = next.filter((storeId) => !current.includes(storeId));
    const removed = current.filter((storeId) => !next.includes(storeId));
    if (added.length === 0 && removed.length === 0) return;

    await tx.userStoreAccess.deleteMany({ where: { userId, storeId: { in: removed } } });
    await tx.userStoreAccess.createMany({
      data: added.map((storeId) => ({ userId, storeId, createdByUserId: this.actorId() })),
    });
    await this.audit.record(
      {
        action: AuditAction.USER_STORE_SCOPE_CHANGED,
        entityType: 'User',
        entityId: userId,
        metadata: { added, removed },
      },
      tx,
    );
  }

  private async trySendInvite(user: { id: string; email: string; name: string }): Promise<boolean> {
    try {
      await this.passwords.sendInvite(user);
      return true;
    } catch (error) {
      this.logger.error({ err: error, userId: user.id }, 'Falha ao enviar convite');
      return false;
    }
  }

  private assertStoreAssignment(role: Role, storeIds: string[]): void {
    const issue = storeAssignmentIssue(role, storeIds.length);
    if (issue) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        { path: 'storeIds', message: issue },
      ]);
    }
  }

  private async assertStoresExist(storeIds: string[]): Promise<void> {
    if (storeIds.length === 0) return;
    const count = await this.prisma.store.count({ where: { id: { in: storeIds } } });
    if (count !== storeIds.length) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
        { path: 'storeIds', message: 'Uma ou mais lojas não existem.' },
      ]);
    }
  }

  private async assertNotLastAdmin(userId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { role: Role.ADMIN, active: true, id: { not: userId } },
    });
    if (others === 0) {
      throw new AppError(
        ApiErrorCode.CONFLICT,
        'É necessário manter ao menos um administrador ativo.',
      );
    }
  }

  private async findOrThrow(id: string): Promise<UserWithStores> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: userInclude });
    if (!user) throw new AppError(ApiErrorCode.NOT_FOUND);
    return user;
  }

  /** Quem concedeu o acesso (registrado em UserStoreAccess.created_by_user_id). */
  private actorId(): string | null {
    return RequestContext.get()?.userId ?? null;
  }
}
