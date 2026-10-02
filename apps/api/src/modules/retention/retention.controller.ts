import { Body, Controller, Param, Patch } from '@nestjs/common';
import { Permission } from '@receita/shared';
import { z } from 'zod';
import { CurrentAuth, RequirePermissions, RouteScope } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RetentionService } from './retention.service.js';

const legalHoldSchema = z.object({ enabled: z.boolean() });

@Controller('admin/retention')
@RouteScope('GLOBAL')
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Patch(':id/legal-hold')
  legalHold(
    @CurrentAuth() auth: AuthContext,
    @Param('id', UuidParamPipe) id: string,
    @Body(new ZodValidationPipe(legalHoldSchema)) body: z.infer<typeof legalHoldSchema>,
  ): Promise<{ enabled: boolean }> {
    return this.retention.setLegalHold(id, body.enabled, auth.user.id);
  }
}
