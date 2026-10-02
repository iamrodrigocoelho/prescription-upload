import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  type LoginResponse,
  loginSchema,
  type MeResponse,
  type ResetPasswordInput,
  resetPasswordSchema,
} from '@receita/shared';
import type { Request, Response } from 'express';
import {
  ANY_SESSION_STATE,
  AllowSessionStates,
  CurrentAuth,
  Public,
  RouteScope,
} from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AuthService } from './auth.service.js';
import { clientInfo } from './client-info.js';
import { PasswordService } from './password.service.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

@Controller('auth')
@RouteScope('SELF')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const grant = await this.auth.login(body, clientInfo(req));
    setSessionCookie(res, this.env, grant.token);
    return { status: grant.status, csrfToken: grant.csrfToken };
  }

  @Post('logout')
  @AllowSessionStates(...ANY_SESSION_STATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth);
    clearSessionCookie(res, this.env);
  }

  @Get('me')
  @AllowSessionStates(...ANY_SESSION_STATE)
  me(@CurrentAuth() auth: AuthContext): Promise<MeResponse> {
    return this.auth.me(auth);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    await this.passwords.requestReset(body.email, req.ip);
    return {
      message:
        'Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.',
    };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.passwords.resetPassword(body, req.ip);
  }
}
