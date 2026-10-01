import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountLockoutService } from './account-lockout.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TotpController } from './totp.controller.js';
import { TotpService } from './totp.service.js';

@Module({
  controllers: [AuthController, TotpController],
  providers: [
    SessionService,
    AccountLockoutService,
    AuthService,
    PasswordService,
    TotpService,
    // Ordem importa: autenticação → CSRF → perfil. Escopo de loja é aplicado nas consultas.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SessionService, PasswordService],
})
export class AuthModule {}
