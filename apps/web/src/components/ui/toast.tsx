'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Toast } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { cx } from '@/lib/cx';

interface ToastMessage {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

const ToastContext = createContext<(text: string, tone?: ToastMessage['tone']) => void>(
  () => undefined,
);

/** Notificações anunciadas por tecnologias assistivas (Radix Toast, região aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'success') => {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), tone, text }]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      <Toast.Provider swipeDirection="right" duration={4000} label="Notificação">
        {children}
        {messages.map((message) => (
          <Toast.Root
            key={message.id}
            type={message.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) setMessages((current) => current.filter((m) => m.id !== message.id));
            }}
            className={cx(
              'flex items-center gap-2 rounded-card border bg-surface p-3 text-body-sm text-content shadow-overlay',
              message.tone === 'error' ? 'border-error' : 'border-success',
            )}
          >
            {message.tone === 'error' ? (
              <AlertCircle className="size-5 text-error" aria-hidden />
            ) : (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            )}
            <Toast.Description>{message.text}</Toast.Description>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
