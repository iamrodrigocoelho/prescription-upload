import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import {
  type TotpConfirmInput,
  type TotpConfirmResponse,
  totpConfirmSchema,
  type TotpDisableInput,
  totpDisableSchema,
  type TotpSetupResponse,
  type TotpVerifyInput,
  type TotpVerifyResponse,
  totpVerifySchema,
} from '@receita/shared';
import type { Request, Response } from 'express';
import { AllowSessionStates, CurrentAuth } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { SessionState } from '../../generated/prisma/client.js';
import { clientInfo } from './client-info.js';
import { setSessionCookie } from './session-cookie.js';
import { TotpService } from './totp.service.js';

@Controller('auth/totp')
export class TotpController {
  constructor(
    private readonly totp: TotpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('setup')
  @AllowSessionStates(SessionState.ACTIVE, SessionState.MFA_ENROLLMENT_REQUIRED)
  @HttpCode(HttpStatus.OK)
  setup(@CurrentAuth() auth: AuthContext): Promise<TotpSetupResponse> {
    return this.totp.setup(auth);
  }

  @Post('confirm')
  @AllowSessionStates(SessionState.ACTIVE, SessionState.MFA_ENROLLMENT_REQUIRED)
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpConfirmSchema)) body: TotpConfirmInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TotpConfirmResponse> {
    const outcome = await this.totp.confirm(auth, body.code, clientInfo(req));
    if (outcome.newSessionToken) setSessionCookie(res, this.env, outcome.newSessionToken);
    return outcome.body;
  }

  @Post('verify')
  @AllowSessionStates(SessionState.PENDING_MFA)
  @HttpCode(HttpStatus.OK)
  async verify(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpVerifySchema)) body: TotpVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TotpVerifyResponse> {
    const outcome = await this.totp.verifyLogin(auth, body, clientInfo(req));
    if (outcome.newSessionToken) setSessionCookie(res, this.env, outcome.newSessionToken);
    return outcome.body;
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpDisableSchema)) body: TotpDisableInput,
  ): Promise<void> {
    await this.totp.disable(auth, body.password, body.code);
  }

  @Post('recovery-codes')
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(totpConfirmSchema)) body: TotpConfirmInput,
  ): Promise<{ recoveryCodes: string[] }> {
    return { recoveryCodes: await this.totp.regenerateRecoveryCodes(auth, body.code) };
  }
}
