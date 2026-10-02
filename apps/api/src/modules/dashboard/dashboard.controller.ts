import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  type DashboardByStatus,
  type DashboardByStore,
  type DashboardQuery,
  dashboardQuerySchema,
  type DashboardSummary,
  type DashboardTimeseries,
  Permission,
} from '@receita/shared';
import { CurrentAuth, RequirePermissions, RouteScope } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { DashboardService } from './dashboard.service.js';

/** Dashboard por escopo (PRD §18, §26.8). Respostas agregadas, sem dados pessoais. */
@Controller('dashboard')
@RouteScope('STORE')
@RequirePermissions(Permission.DASHBOARD_READ)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(auth, query);
  }

  @Get('timeseries')
  @Header('Cache-Control', 'no-store')
  timeseries(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardTimeseries> {
    return this.dashboard.timeseries(auth, query);
  }

  @Get('by-status')
  @Header('Cache-Control', 'no-store')
  byStatus(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardByStatus> {
    return this.dashboard.byStatus(auth, query);
  }

  @Get('by-store')
  @Header('Cache-Control', 'no-store')
  byStore(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardByStore> {
    return this.dashboard.byStore(auth, query);
  }
}
