import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AdminUserView,
  type CreateUserInput,
  createUserSchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type Paginated,
  Permission,
  type SetUserStoresInput,
  setUserStoresSchema,
  type UpdateUserInput,
  updateUserSchema,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('admin/users')
@RequirePermissions(Permission.USERS_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Paginated<AdminUserView>> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<AdminUserView> {
    return this.users.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ): Promise<AdminUserView & { inviteSent: boolean }> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<AdminUserView> {
    return this.users.update(auth, id, body);
  }

  @Put(':id/stores')
  setStores(
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(setUserStoresSchema)) body: SetUserStoresInput,
  ): Promise<AdminUserView> {
    return this.users.setStores(id, body.storeIds);
  }

  @Post(':id/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  revokeSessions(@Param('id', UuidParamPipe) id: string): Promise<{ revoked: number }> {
    return this.users.revokeSessions(id);
  }

  @Post(':id/totp/reset')
  @HttpCode(HttpStatus.OK)
  resetTotp(@Param('id', UuidParamPipe) id: string): Promise<AdminUserView> {
    return this.users.resetTotp(id);
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  resendInvite(@Param('id', UuidParamPipe) id: string): Promise<{ inviteSent: boolean }> {
    return this.users.resendInvite(id);
  }
}
