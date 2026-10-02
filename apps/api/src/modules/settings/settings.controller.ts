import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  Permission,
  type SystemSettings,
  type UpdateSystemSettingsInput,
  updateSystemSettingsSchema,
} from '@receita/shared';
import { RequirePermissions, RouteScope } from '../../common/auth/decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { SettingsService } from './settings.service.js';

@Controller('admin/settings')
@RouteScope('GLOBAL')
@RequirePermissions(Permission.SETTINGS_MANAGE)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<SystemSettings> {
    return this.settings.getAll();
  }

  @Patch()
  update(
    @Body(new ZodValidationPipe(updateSystemSettingsSchema)) body: UpdateSystemSettingsInput,
  ): Promise<SystemSettings> {
    return this.settings.update(body);
  }
}
