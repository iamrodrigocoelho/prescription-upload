import { Injectable, Logger } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { CaptchaVerifier } from './captcha.verifier.js';

/** Exige captcha válido; falhas viram log de segurança + métrica, sem dados pessoais. */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger('SecurityCaptcha');

  constructor(
    private readonly verifier: CaptchaVerifier,
    private readonly metrics: MetricsService,
  ) {}

  async assertValid(token: string | undefined, remoteIp: string | undefined): Promise<void> {
    const result = await this.verifier.verify(token, remoteIp);
    this.metrics.captchaVerifications.inc({ result: result.ok ? 'success' : result.reason });
    if (result.ok) return;
    this.logger.warn({ event: 'captcha_rejected', reason: result.reason }, 'Captcha rejeitado');
    throw new AppError(ApiErrorCode.CAPTCHA_FAILED);
  }
}
