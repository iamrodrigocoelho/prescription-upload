import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@receita/shared';

export interface RequestContextStore {
  requestId: string;
  ip: string | undefined;
  userId?: string;
  role?: Role;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/** Contexto por requisição (correlation ID, IP, usuário) acessível sem passar parâmetros. */
export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T): T {
    return storage.run(store, callback);
  },
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  setActor(userId: string, role: Role): void {
    const store = storage.getStore();
    if (store) {
      store.userId = userId;
      store.role = role;
    }
  },
};
