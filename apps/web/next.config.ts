import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const isProd = process.env.NODE_ENV === 'production';

const noStore = { key: 'Cache-Control', value: 'no-store' };
const noReferrer = { key: 'Referrer-Policy', value: 'no-referrer' };

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  turbopack: { root: resolve(import.meta.dirname, '../..') },
  images: { unoptimized: true },
  // Em dev, o Next loga cada requisição; /p/{token} carrega uma credencial (PRD §6.5).
  logging: { incomingRequests: { ignore: [/^\/p\//, /^\/api\/public\/patient-links\//] } },
  // Mesma origem para a API (D-008): cookies first-party, sem CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
  // A CSP (com nonce por requisição) é aplicada em src/proxy.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          ...(isProd
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
            : []),
        ],
      },
      // Link personalizado: credencial na URL (PRD §6.5).
      { source: '/p', headers: [noStore, noReferrer] },
      { source: '/p/:path*', headers: [noStore, noReferrer] },
      // Token de redefinição/convite no fragmento; reforço contra vazamento.
      { source: '/redefinir-senha', headers: [noStore, noReferrer] },
      { source: '/definir-senha', headers: [noStore, noReferrer] },
      { source: '/admin/:path*', headers: [noStore] },
      { source: '/login/:path*', headers: [noStore] },
    ];
  },
};

export default nextConfig;
