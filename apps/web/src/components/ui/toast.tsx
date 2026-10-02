'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Toast } from 'radix-ui';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import { cx } from '@/lib/cx';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
  action?: ToastAction;
}

type Notify = (text: string, tone?: ToastMessage['tone'], action?: ToastAction) => void;

const ToastContext = createContext<Notify>(() => undefined);

/** Notificações anunciadas por tecnologias assistivas (Radix Toast, região aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const notify = useCallback<Notify>((text, tone = 'success', action) => {
    setMessages((current) => [...current, { id: Date.now() + Math.random(), tone, text, action }]);
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
              message.tone === 'error'
                ? 'border-error'
                : message.tone === 'info'
                  ? 'border-line-strong'
                  : 'border-success',
            )}
          >
            {message.tone === 'error' ? (
              <AlertCircle className="size-5 text-error" aria-hidden />
            ) : (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            )}
            <Toast.Description className="flex-1">{message.text}</Toast.Description>
            {message.action ? (
              <Toast.Action altText={message.action.label} asChild>
                <button
                  type="button"
                  onClick={message.action.onClick}
                  className="min-h-9 rounded-button border border-line-strong px-3 text-body-sm font-semibold hover:bg-hover"
                >
                  {message.action.label}
                </button>
              </Toast.Action>
            ) : null}
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
