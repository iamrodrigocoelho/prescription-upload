import { headers } from 'next/headers';

/** Nonce da CSP (gerado em proxy.ts) e chave pública do reCAPTCHA. */
export async function publicPageProps(): Promise<{ nonce: string | undefined; siteKey: string }> {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return { nonce, siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '' };
}
