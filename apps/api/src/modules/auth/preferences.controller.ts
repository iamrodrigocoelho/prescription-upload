import { Body, Controller, Get, Patch } from '@nestjs/common';
import { type UserPreferences, userPreferencesSchema } from '@receita/shared';
import { CurrentAuth, RouteScope } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/** Preferências do próprio usuário (som de alerta — PRD §19.2). */
@Controller('me/preferences')
@RouteScope('SELF')
export class PreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentAuth() auth: AuthContext): Promise<UserPreferences> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { notificationSoundEnabled: true },
    });
    return { notificationSound: user.notificationSoundEnabled };
  }

  @Patch()
  async update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(userPreferencesSchema)) body: UserPreferences,
  ): Promise<UserPreferences> {
    await this.prisma.user.update({
      where: { id: auth.user.id },
      data: { notificationSoundEnabled: body.notificationSound },
    });
    return body;
  }
}
