'use client';

import { createSoundGate, localStorageMarks } from './sound-gate';

/**
 * Alerta sonoro (PRD §19.2, DESIGN §9.2): tom curto e discreto gerado pela Web
 * Audio API (nenhum arquivo de terceiros). Desbloqueado na primeira interação do
 * usuário (regras de autoplay). Apenas a aba líder toca (Web Locks).
 */
let context: AudioContext | null = null;
let leader = typeof navigator === 'undefined' || !('locks' in navigator);
let gate: ReturnType<typeof createSoundGate> | null = null;

export function initNotificationSound(): void {
  if (typeof window === 'undefined' || gate) return;
  gate = createSoundGate({ marks: localStorageMarks(window.localStorage), isLeader: () => leader });
  if ('locks' in navigator) {
    // Mantém o lock enquanto a aba existir; ao fechar, outra aba assume.
    void navigator.locks.request('rv-notification-sound', () => {
      leader = true;
      return new Promise<void>(() => undefined);
    });
  }
  const unlock = () => void ensureContext()?.resume();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  context ??= new AudioContext();
  return context;
}

/** `true` quando o navegador ainda bloqueia o áudio (sem interação). */
export function isSoundBlocked(): boolean {
  return !context || context.state !== 'running';
}

/** Toca o alerta uma única vez por evento. Retorna `false` se bloqueado. */
export function playNotification(eventId: string): boolean {
  if (!gate?.shouldPlay(eventId)) return true;
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  for (const [frequency, start] of [
    [880, 0],
    [1320, 0.12],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now + start);
    oscillator.connect(gain);
    oscillator.start(now + start);
    oscillator.stop(now + start + 0.18);
  }
  return true;
}
