'use client';

import type { RealtimeEvent } from '@receita/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';

type Listener = (event: RealtimeEvent) => void;

const RealtimeContext = createContext<{ subscribe: (listener: Listener) => () => void } | null>(
  null,
);

/**
 * Conexão SSE única por aba (/api/realtime/stream). O EventSource reconecta
 * sozinho enviando Last-Event-ID; após qualquer reconexão a fila é recarregada
 * para não perder eventos (D-063). Eventos trazem só IDs — os detalhes vêm da API.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const client = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let hadError = false;

    const connect = () => {
      source = new EventSource('/api/realtime/stream', { withCredentials: true });
      source.onopen = () => {
        if (hadError) void client.invalidateQueries({ queryKey: ['prescriptions'] });
        hadError = false;
      };
      source.onmessage = (message: MessageEvent<string>) => {
        try {
          const event = JSON.parse(message.data) as RealtimeEvent;
          for (const listener of listeners.current) listener(event);
        } catch {
          // ignora mensagem malformada
        }
      };
      source.onerror = () => {
        hadError = true;
        // Fechado definitivamente (ex.: 401/429): nova tentativa manual e recarga dos dados.
        if (source?.readyState === EventSource.CLOSED) {
          retry = setTimeout(connect, 10_000);
          void client.invalidateQueries({ queryKey: ['prescriptions'] });
        }
      };
    };
    connect();
    return () => {
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [client]);

  return (
    <RealtimeContext.Provider
      value={{
        subscribe: (listener) => {
          listeners.current.add(listener);
          return () => listeners.current.delete(listener);
        },
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(listener: Listener): void {
  const context = useContext(RealtimeContext);
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  }, [listener]);
  useEffect(() => context?.subscribe((event) => ref.current(event)), [context]);
}
