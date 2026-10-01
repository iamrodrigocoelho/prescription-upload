import type { MailMessage } from '../../infra/mail/mail.provider.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(title: string, paragraphs: string[], link: string, cta: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f2328;line-height:1.5">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#1f2328;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none">${escapeHtml(cta)}</a></p>
<p style="font-size:12px;color:#57606a">Se você não solicitou esta ação, ignore este e-mail. Nunca compartilhe este link.</p>
</body></html>`;
}

export function passwordResetEmail(to: string, link: string, ttlMinutes: number): MailMessage {
  const subject = 'Redefinição de senha — Receita Venancio';
  const text = [
    'Recebemos uma solicitação para redefinir a sua senha.',
    `Acesse o link abaixo em até ${ttlMinutes} minutos:`,
    link,
    '',
    'Se você não solicitou, ignore este e-mail. Nunca compartilhe este link.',
  ].join('\n');
  const html = layout(
    'Redefinição de senha',
    [
      'Recebemos uma solicitação para redefinir a sua senha.',
      `O link é válido por ${ttlMinutes} minutos e pode ser usado uma única vez.`,
    ],
    link,
    'Redefinir senha',
  );
  return { to, subject, text, html };
}

export function inviteEmail(to: string, name: string, link: string, ttlHours: number): MailMessage {
  const subject = 'Seu acesso ao Receita Venancio';
  const text = [
    `Olá, ${name}.`,
    'Um acesso ao Receita Venancio foi criado para você.',
    `Defina sua senha pelo link abaixo em até ${ttlHours} horas:`,
    link,
    '',
    'Se você não esperava este convite, ignore este e-mail.',
  ].join('\n');
  const html = layout(
    'Seu acesso ao Receita Venancio',
    [
      `Olá, ${escapeHtml(name)}.`,
      'Um acesso ao Receita Venancio foi criado para você.',
      `Defina sua senha em até ${ttlHours} horas. O link pode ser usado uma única vez.`,
    ],
    link,
    'Definir senha',
  );
  return { to, subject, text, html };
}
