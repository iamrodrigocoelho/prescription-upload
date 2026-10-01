import { Global, Module } from '@nestjs/common';
import { CaptchaService } from './captcha.service.js';
import { CaptchaVerifier } from './captcha.verifier.js';
import { RecaptchaV2Verifier } from './recaptcha-v2.verifier.js';

@Global()
@Module({
  providers: [CaptchaService, { provide: CaptchaVerifier, useClass: RecaptchaV2Verifier }],
  exports: [CaptchaService],
})
export class CaptchaModule {}
