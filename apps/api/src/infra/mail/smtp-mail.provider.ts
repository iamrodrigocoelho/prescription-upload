import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { type MailMessage, MailProvider } from './mail.provider.js';

@Injectable()
export class SmtpMailProvider extends MailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    super();
    this.from = env.MAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      // Em produção, exige TLS (STARTTLS) mesmo sem `secure`.
      requireTLS: env.NODE_ENV === 'production',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
