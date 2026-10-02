'use client';

import type { RealtimeEvent, UserPreferences } from '@receita/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { initNotificationSound, isSoundBlocked, playNotification } from '@/lib/notification-sound';
import { useRealtime } from '@/lib/realtime';

const PREFS_KEY = ['me', 'preferences'] as const;

function usePreferences() {
  return useQuery({ queryKey: PREFS_KEY, queryFn: () => api<UserPreferences>('/me/preferences') });
}

/**
 * Notificações de novas receitas (PRD §19, DESIGN §9): toast com ação "Abrir",
 * contadores/badge atualizados, anúncio aria-live (sem roubar foco) e som opcional.
 * O feedback visual existe sempre, com ou sem som.
 */
export function NotificationCenter() {
  const notify = useToast();
  const router = useRouter();
  const client = useQueryClient();
  const preferences = usePreferences();
  const [announcement, setAnnouncement] = useState('');
  const [soundHint, setSoundHint] = useState(false);

  useEffect(() => initNotificationSound(), []);

  const onEvent = useCallback(
    (event: RealtimeEvent) => {
      if (event.type === 'counters.updated') {
        void client.invalidateQueries({ queryKey: ['prescriptions', 'counters'] });
        return;
      }
      if (event.type === 'prescription.created') {
        setAnnouncement(`Nova receita recebida. ${new Date().toLocaleTimeString('pt-BR')}`);
        notify('Nova receita recebida.', 'info', {
          label: 'Abrir',
          onClick: () => router.push(`/admin/receitas/${event.prescriptionId}`),
        });
        if (preferences.data?.notificationSound) {
          const played = playNotification(event.prescriptionId);
          setSoundHint(!played || isSoundBlocked());
        }
      }
      if (event.type === 'prescription.status_changed') {
        setAnnouncement('O status de uma receita foi atualizado.');
      }
    },
    [client, notify, preferences.data?.notificationSound, router],
  );
  useRealtime(onEvent);

  return (
    <>
      <div aria-live="polite" className="sr-only" data-testid="realtime-announcer">
        {announcement}
      </div>
      {soundHint ? (
        <p className="fixed right-4 bottom-20 z-40 max-w-xs rounded-card border border-line bg-surface p-3 text-caption text-content-secondary shadow-overlay">
          O navegador bloqueou o som. Clique em qualquer lugar da página para ativar os alertas
          sonoros.
          <button type="button" className="ml-2 underline" onClick={() => setSoundHint(false)}>
            Fechar
          </button>
        </p>
      ) : null}
    </>
  );
}

/** Controle visível no header: liga/desliga o alerta sonoro (salvo no servidor). */
export function SoundToggle() {
  const client = useQueryClient();
  const preferences = usePreferences();
  const enabled = preferences.data?.notificationSound ?? false;
  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      api<UserPreferences>('/me/preferences', {
        method: 'PATCH',
        body: { notificationSound: next },
      }),
    onSuccess: (data) => client.setQueryData(PREFS_KEY, data),
  });
  return (
    <button
      type="button"
      aria-pressed={enabled}
      disabled={preferences.isLoading || toggle.isPending}
      onClick={() => toggle.mutate(!enabled)}
      className="flex min-h-11 items-center gap-2 rounded-button px-2 text-body-sm hover:bg-hover disabled:opacity-50"
      title={enabled ? 'Desligar som de alerta' : 'Ligar som de alerta'}
    >
      {enabled ? (
        <Bell className="size-5" aria-hidden />
      ) : (
        <BellOff className="size-5" aria-hidden />
      )}
      <span className="hidden sm:inline">{enabled ? 'Som ligado' : 'Som desligado'}</span>
      <span className="sr-only sm:hidden">
        {enabled ? 'Som de alerta ligado' : 'Som de alerta desligado'}
      </span>
    </button>
  );
}
