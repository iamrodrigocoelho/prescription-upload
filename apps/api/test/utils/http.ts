import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { TEST_PASSWORD } from './factories.js';

/**
 * Cliente HTTP com cookie jar e token CSRF, simulando o navegador.
 */
export class Client {
  readonly agent: TestAgent;
  csrfToken = '';

  constructor(app: INestApplication) {
    this.agent = request.agent(app.getHttpServer());
  }

  get(path: string) {
    return this.agent.get(path);
  }

  post(path: string, body?: object) {
    return this.agent.post(path).set('x-csrf-token', this.csrfToken).send(body);
  }

  patch(path: string, body?: object) {
    return this.agent.patch(path).set('x-csrf-token', this.csrfToken).send(body);
  }

  put(path: string, body?: object) {
    return this.agent.put(path).set('x-csrf-token', this.csrfToken).send(body);
  }

  /** Login por senha; atualiza o token CSRF. Retorna a resposta para asserções. */
  async login(email: string, password = TEST_PASSWORD) {
    const res = await this.agent.post('/auth/login').send({ email, password });
    if (res.body?.csrfToken) this.csrfToken = res.body.csrfToken as string;
    return res;
  }

  /** Atualiza o CSRF a partir de uma resposta que rotacionou a sessão. */
  adopt(res: { body?: { csrfToken?: string } }): void {
    if (res.body?.csrfToken) this.csrfToken = res.body.csrfToken;
  }
}

/** Valor do cookie de sessão presente no Set-Cookie (ou undefined). */
export function sessionCookieFrom(res: { headers: Record<string, unknown> }): string | undefined {
  const header = res.headers['set-cookie'];
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const cookie = cookies.find((value) => value.startsWith('rv_session='));
  return cookie?.split(';')[0]?.split('=')[1] || undefined;
}

/** Cria um usuário (via factory) e devolve um Client já autenticado como ele. */
export async function loginAs(
  app: INestApplication,
  create: () => Promise<{ user: { email: string } }>,
): Promise<Client> {
  const { user } = await create();
  const client = new Client(app);
  const res = await client.login(user.email);
  if (res.status !== 200 || res.body.status !== 'AUTHENTICATED') {
    throw new Error(`Login de teste falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return client;
}
