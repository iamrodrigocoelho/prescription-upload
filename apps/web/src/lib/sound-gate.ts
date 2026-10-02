/**
 * Decide se esta aba deve tocar o alerta de um evento (D-064):
 * - apenas a aba LÍDER toca (eleita via Web Locks; sem suporte, todas são candidatas);
 * - cada evento toca no máximo uma vez, mesmo se reentregue (reconexão/replay) ou
 *   recebido por várias abas — a marca é compartilhada (localStorage).
 */
export interface SharedMarks {
  has(key: string): boolean;
  add(key: string): void;
}

export function createSoundGate(options: { marks: SharedMarks; isLeader: () => boolean }) {
  return {
    shouldPlay(eventId: string): boolean {
      if (!options.isLeader()) return false;
      const key = `rv-sound:${eventId}`;
      if (options.marks.has(key)) return false;
      options.marks.add(key);
      return true;
    },
  };
}

/** Marcas compartilhadas entre abas via localStorage (com limpeza de entradas antigas). */
export function localStorageMarks(storage: Storage, ttlMs = 10 * 60_000): SharedMarks {
  const read = (key: string) => {
    try {
      const value = storage.getItem(key);
      return value !== null && Date.now() - Number(value) < ttlMs;
    } catch {
      return false;
    }
  };
  return {
    has: read,
    add: (key) => {
      try {
        storage.setItem(key, String(Date.now()));
        for (let i = storage.length - 1; i >= 0; i -= 1) {
          const name = storage.key(i);
          if (name?.startsWith('rv-sound:') && !read(name)) storage.removeItem(name);
        }
      } catch {
        // armazenamento indisponível: a liderança ainda evita a maioria das duplicações
      }
    },
  };
}
