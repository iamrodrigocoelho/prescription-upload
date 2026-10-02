import type { AddressInfo } from 'node:net';
import type { RealtimeEvent } from '@receita/shared';
import type { Redis } from 'ioredis';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { REDIS } from '../src/infra/redis/redis.module.js';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createUser, TEST_PASSWORD } from './utils/factories.js';

interface Session {
  cookie: string;
  csrf: string;
}

/** Leitor SSE mínimo sobre fetch (o EventSource do navegador faz o mesmo). */
class SseReader {
  readonly events: { id?: string; data: RealtimeEvent }[] = [];
  closed = false;
  private readonly controller = new AbortController();

  constructor(private readonly response: Response) {
    void this.pump();
  }

  static async open(base: string, session: Session, lastEventId?: string): Promise<SseReader> {
    const response = await fetch(`${base}/realtime/stream`, {
      headers: { Cookie: session.cookie, ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
    });
    return new SseReader(response);
  }

  get status() {
    return this.response.status;
  }

  get headers() {
    return this.response.headers;
  }

  private async pump() {
    const reader = this.response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const id = /^id: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (data) this.events.push({ id, data: JSON.parse(data) as RealtimeEvent });
        }
      }
    } catch {
      // abortado
    }
    this.closed = true;
  }

  stop() {
    this.controller.abort();
    void this.response.body?.cancel().catch(() => undefined);
  }
}

async function until(check: () => boolean, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Tempo esgotado aguardando condição');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('Tempo real via SSE (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  let base: string;
  let publisher: RealtimePublisher;
  const readers: SseReader[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
    await ctx.app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
    publisher = new RealtimePublisher(ctx.app.get<Redis>(REDIS), ctx.app.get<Env>(ENV));
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterEach(() => {
    for (const reader of readers.splice(0)) reader.stop();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function login(email: string): Promise<Session> {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    return { cookie, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
  }

  async function connect(session: Session, lastEventId?: string) {
    const reader = await SseReader.open(base, session, lastEventId);
    readers.push(reader);
    expect(reader.status).toBe(200);
    // Pequena espera para o registro da conexão antes de publicar.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return reader;
  }

  it('entrega apenas eventos das lojas do escopo; payload só com IDs', async () => {
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
    const reader = await connect(await login(user.email));
    expect(reader.headers.get('content-type')).toContain('text/event-stream');
    expect(reader.headers.get('x-accel-buffering')).toBe('no');

    await publisher.publish([
      { type: 'prescription.created', prescriptionId: 'p-b', storeId: b.id },
      { type: 'prescription.created', prescriptionId: 'p-a', storeId: a.id },
      { type: 'counters.updated', storeId: b.id },
      { type: 'counters.updated', storeId: a.id },
    ]);
    await until(() => reader.events.length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(reader.events.map((e) => e.data)).toEqual([
      { type: 'prescription.created', prescriptionId: 'p-a', storeId: a.id },
      { type: 'counters.updated', storeId: a.id },
    ]);
    expect(reader.events.every((e) => /^\d+-\d+$/.test(e.id ?? ''))).toBe(true);
  });

  it('Admin recebe eventos de todas as lojas', async () => {
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { role: 'ADMIN' });
    const reader = await connect(await login(user.email));
    await publisher.publish([
      { type: 'counters.updated', storeId: a.id },
      { type: 'counters.updated', storeId: b.id },
    ]);
    await until(() => reader.events.length === 2);
  });

  it('Last-Event-ID reenvia os eventos perdidos', async () => {
    const a = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
    const session = await login(user.email);
    const first = await connect(session);
    await publisher.publish([{ type: 'counters.updated', storeId: a.id }]);
    await until(() => first.events.length === 1);
    const lastId = first.events[0]!.id!;
    first.stop();

    await publisher.publish([
      { type: 'prescription.created', prescriptionId: 'perdido-1', storeId: a.id },
      { type: 'prescription.created', prescriptionId: 'perdido-2', storeId: a.id },
    ]);
    const second = await connect(session, lastId);
    await until(() => second.events.length >= 2);
    expect(
      second.events.map((e) => (e.data as { prescriptionId?: string }).prescriptionId),
    ).toEqual(['perdido-1', 'perdido-2']);
  });

  it('stream é encerrado após logout', async () => {
    const a = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
    const session = await login(user.email);
    const reader = await connect(session);
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    });
    await until(() => reader.closed);
  });

  it('stream é encerrado quando o Admin revoga as sessões ou altera o escopo', async () => {
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
    const { user: admin } = await createUser(ctx.prisma, crypto, { role: 'ADMIN' });
    const adminSession = await login(admin.email);

    const revoked = await connect(await login(user.email));
    await fetch(`${base}/admin/users/${user.id}/sessions/revoke`, {
      method: 'POST',
      headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrf },
    });
    await until(() => revoked.closed);

    const rescoped = await connect(await login(user.email));
    await fetch(`${base}/admin/users/${user.id}/stores`, {
      method: 'PUT',
      headers: {
        Cookie: adminSession.cookie,
        'X-CSRF-Token': adminSession.csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storeIds: [b.id] }),
    });
    await until(() => rescoped.closed);
  });

  it('exige sessão e limita streams por usuário', async () => {
    const unauthenticated = await fetch(`${base}/realtime/stream`);
    expect(unauthenticated.status).toBe(401);

    const a = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
    const session = await login(user.email);
    for (let i = 0; i < 5; i += 1) await connect(session);
    const sixth = await fetch(`${base}/realtime/stream`, { headers: { Cookie: session.cookie } });
    expect(sixth.status).toBe(429);
  });
});
