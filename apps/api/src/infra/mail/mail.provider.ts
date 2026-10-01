export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Abstração de envio de e-mail. Implementações: SMTP (Mailpit em dev, servidor
 * próprio em produção). Testes usam uma implementação em memória.
 */
export abstract class MailProvider {
  abstract send(message: MailMessage): Promise<void>;
}
