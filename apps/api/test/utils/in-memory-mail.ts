import { type MailMessage, MailProvider } from '../../src/infra/mail/mail.provider.js';

export class InMemoryMailProvider extends MailProvider {
  readonly messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.messages.length = 0;
  }

  /** Aguarda uma mensagem para o destinatário (o envio de reset é assíncrono). */
  async waitFor(to: string, timeoutMs = 3000): Promise<MailMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.find((message) => message.to === to);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Nenhum e-mail para ${to} em ${timeoutMs} ms`);
  }
}

/** Extrai o token do fragmento `#token=` de um link enviado por e-mail. */
export function extractToken(message: MailMessage): string {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(message.text);
  if (!match?.[1]) throw new Error('Token não encontrado no e-mail');
  return match[1];
}
