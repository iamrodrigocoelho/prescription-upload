import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type PatientSearchInput,
  type PatientSearchResult,
  patientSearchSchema,
  Permission,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PatientsService } from './patients.service.js';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  /** POST (e não GET) para que CPF/telefone/e-mail não apareçam em URLs (D-011). */
  @Post('search')
  @RequirePermissions(Permission.PATIENTS_SEARCH)
  @HttpCode(HttpStatus.OK)
  search(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(patientSearchSchema)) body: PatientSearchInput,
  ): Promise<{ results: PatientSearchResult[] }> {
    return this.patients.search(auth, body).then((results) => ({ results }));
  }
}
