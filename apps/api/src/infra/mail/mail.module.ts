import { Global, Module } from '@nestjs/common';
import { MailProvider } from './mail.provider.js';
import { SmtpMailProvider } from './smtp-mail.provider.js';

@Global()
@Module({
  providers: [{ provide: MailProvider, useClass: SmtpMailProvider }],
  exports: [MailProvider],
})
export class MailModule {}
