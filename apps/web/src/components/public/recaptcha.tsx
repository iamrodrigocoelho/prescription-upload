'use client';

import Script from 'next/script';
import { useCallback, useEffect, useImperativeHandle, useRef } from 'react';

interface Grecaptcha {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      hl?: string;
    },
  ) => number;
  reset: (widgetId?: number) => void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    __rvRecaptchaReady?: () => void;
  }
}

export interface RecaptchaHandle {
  reset: () => void;
}

/**
 * Google reCAPTCHA v2 checkbox (PRD §10.4). Script assíncrono, carregado depois
 * do conteúdo (RNF-004), com o nonce da CSP. O token é de uso único: após cada
 * tentativa de envio o widget é reiniciado.
 */
export function Recaptcha({
  siteKey,
  nonce,
  onToken,
  ref,
}: {
  siteKey: string;
  nonce: string | undefined;
  onToken: (token: string | null) => void;
  ref?: React.Ref<RecaptchaHandle>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const renderWidget = useCallback(() => {
    if (!container.current || widgetId.current !== null || !window.grecaptcha?.render) return;
    widgetId.current = window.grecaptcha.render(container.current, {
      sitekey: siteKey,
      hl: 'pt-BR',
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(null),
      'error-callback': () => onTokenRef.current(null),
    });
  }, [siteKey]);

  useEffect(() => {
    window.__rvRecaptchaReady = renderWidget;
    renderWidget();
  }, [renderWidget]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current !== null) window.grecaptcha?.reset(widgetId.current);
      onTokenRef.current(null);
    },
  }));

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js?onload=__rvRecaptchaReady&render=explicit&hl=pt-BR"
        strategy="afterInteractive"
        nonce={nonce}
      />
      <div ref={container} className="min-h-[78px]" />
    </>
  );
}
