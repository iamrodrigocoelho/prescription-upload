import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIES = ['__Host-rv_session', 'rv_session'];

/**
 * CSP com nonce por requisição (PRD §35) e verificação otimista de sessão no
 * Admin. A autorização real é sempre feita pela API.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/admin') && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // Terceiros (reCAPTCHA) apenas nas rotas públicas de envio; o Admin não carrega nada externo.
  const isPublicSubmission = /^\/(l|p|enviar)(\/|$)/.test(pathname);
  // Admin: visualizador de anexos carrega imagens/PDF direto do storage por URL assinada.
  const storageOrigin = (() => {
    try {
      return new URL(process.env.STORAGE_PUBLIC_ENDPOINT || process.env.STORAGE_ENDPOINT || '')
        .origin;
    } catch {
      return '';
    }
  })();
  const isAdmin = pathname.startsWith('/admin');
  const storageSrc = isAdmin && storageOrigin ? ` ${storageOrigin}` : '';
  const recaptchaScript = isPublicSubmission
    ? ' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/'
    : '';
  const isDev = process.env.NODE_ENV === 'development';
  const isHttps =
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${recaptchaScript}${isDev ? " 'unsafe-eval'" : ''}`,
    isPublicSubmission
      ? 'frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/'
      : storageSrc
        ? `frame-src${storageSrc}`
        : "frame-src 'none'",
    // Estilos inline de atributo são usados por primitivos Radix (posicionamento).
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    `img-src 'self' data: blob:${storageSrc}`,
    "font-src 'self'",
    `connect-src 'self'${isPublicSubmission ? ' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|brand|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
