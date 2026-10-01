import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Receita Venancio', template: '%s | Receita Venancio' },
  description: 'Envio e gestão de receitas da Drogaria Venancio.',
  robots: { index: false, follow: false },
  referrer: 'strict-origin-when-cross-origin',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Lê o nonce: força renderização dinâmica, requisito da CSP com nonce.
  await headers();
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-page text-body text-content antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
