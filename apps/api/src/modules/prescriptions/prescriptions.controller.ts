import { Controller, Get, Query } from '@nestjs/common';
import {
  type ListPrescriptionsQuery,
  listPrescriptionsQuerySchema,
  Permission,
  type PrescriptionCounters,
  type PrescriptionCountersQuery,
  prescriptionCountersQuerySchema,
  type PrescriptionListResponse,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Controller('prescriptions')
@RequirePermissions(Permission.PRESCRIPTIONS_READ)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(listPrescriptionsQuerySchema)) query: ListPrescriptionsQuery,
  ): Promise<PrescriptionListResponse> {
    return this.prescriptions.list(auth, query);
  }

  @Get('counters')
  counters(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(prescriptionCountersQuerySchema)) query: PrescriptionCountersQuery,
  ): Promise<PrescriptionCounters> {
    return this.prescriptions.counters(auth, query);
  }
}
