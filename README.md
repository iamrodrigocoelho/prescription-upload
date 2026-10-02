# Receita Venancio

Aplicação web de envio e gestão de receitas médicas da Drogaria Venancio.

- Requisitos de produto e regras de negócio: [`PRD.md`](./PRD.md)
- UI, UX e Design System: [`DESIGN.md`](./DESIGN.md)
- Decisões técnicas: [`docs/decisions.md`](./docs/decisions.md)
- Guia para agentes/colaboradores: [`CLAUDE.md`](./CLAUDE.md)

## Stack

| Camada                | Tecnologia                                                  |
| --------------------- | ----------------------------------------------------------- |
| Monorepo              | pnpm workspaces + Turborepo                                 |
| Frontend (`apps/web`) | Next.js (App Router), React, TypeScript, Tailwind, Radix UI |
| API (`apps/api`)      | NestJS 12 (ESM), TypeScript, REST                           |
| Banco                 | PostgreSQL 17 + Prisma (migrations versionadas)             |
| Rate limiting         | Valkey (compatível com Redis)                               |
| Arquivos              | SeaweedFS (S3-compatible, bucket privado)                   |
| E-mail                | SMTP (Mailpit em desenvolvimento)                           |

Tudo é open source e pode ser hospedado em infraestrutura própria.

## Pré-requisitos

- **pnpm 11** (`npm i -g pnpm@11`). O Node 24 LTS é baixado automaticamente pelo pnpm
  para este repositório (`devEngines` no `package.json`), sem alterar o Node do sistema.
- **Docker** com Compose (Docker Desktop, OrbStack ou Colima) para a infraestrutura local.
  Sem Docker, veja [Infraestrutura sem Docker](#infraestrutura-sem-docker).

## Setup local

```bash
# 1. Variáveis de ambiente
cp .env.example .env
# Preencha os segredos obrigatórios (cada um com um valor distinto):
#   CPF_ENCRYPTION_KEY, TOTP_ENCRYPTION_KEY   →  openssl rand -base64 32
#   CPF_LOOKUP_PEPPER, SESSION_SECRET         →  openssl rand -base64 32
#   SEED_ADMIN_PASSWORD, SEED_DEMO_PASSWORD   →  senhas de desenvolvimento (≥ 12 caracteres)

# 2. Infraestrutura (PostgreSQL, Valkey, SeaweedFS, Mailpit)
docker compose up -d

# 3. Dependências
pnpm install

# 4. Banco de dados
pnpm db:migrate      # aplica as migrations
pnpm db:seed         # admin, lojas e usuários de exemplo

# 5. Desenvolvimento
pnpm dev             # web em http://localhost:3000, API em http://localhost:4000
```

Acesse http://localhost:3000/login com o e-mail `SEED_ADMIN_EMAIL` e a senha
`SEED_ADMIN_PASSWORD` do seu `.env`. Usuários de exemplo: `gestor@receita.local`
(lojas 101 e 102) e `colaborador@receita.local` (loja 101), com `SEED_DEMO_PASSWORD`.
Com `PATIENT_PROVIDER=mock`, a busca de pacientes usa dados fictícios — por exemplo,
o telefone `(21) 99000-0099` retorna dois pacientes.

E-mails enviados em desenvolvimento (recuperação de senha, convites) aparecem no Mailpit:
http://localhost:8025.

## Scripts

| Comando                  | Descrição                                                            |
| ------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`               | Sobe web e API em modo watch                                         |
| `pnpm build`             | Build de todos os pacotes                                            |
| `pnpm lint`              | ESLint em todo o monorepo                                            |
| `pnpm typecheck`         | Verificação de tipos (strict)                                        |
| `pnpm test`              | Testes unitários                                                     |
| `pnpm test:e2e`          | Testes de integração/e2e da API (requer Postgres, Valkey, SeaweedFS) |
| `pnpm test:e2e:web`      | E2E das telas públicas (Playwright + axe; requer infra e internet)   |
| `pnpm db:migrate`        | Cria/aplica migrations em desenvolvimento                            |
| `pnpm db:migrate:deploy` | Aplica migrations pendentes (produção/CI)                            |
| `pnpm db:seed`           | Popula dados de desenvolvimento                                      |
| `pnpm db:reset`          | Recria o banco de desenvolvimento do zero                            |
| `pnpm format`            | Prettier                                                             |

## Área pública (envio de receitas)

| Entrada                              | Rota                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| Link da loja (QR Code, WhatsApp)     | `/l/{slug}` — copie em Admin → Lojas                    |
| Entrada genérica com seleção de loja | `/enviar`                                               |
| Link personalizado (gerado no Admin) | `/p/{token}` → troca o token por cookie e segue em `/p` |

Variáveis desta área (veja `.env.example`):

- `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_EXPECTED_HOSTNAMES` —
  em desenvolvimento, as chaves de **teste** oficiais do Google (sempre aprovam e o widget
  mostra um aviso). Produção exige chaves próprias "v2 Checkbox" para o domínio definitivo;
  a API recusa a chave de teste com `NODE_ENV=production`.
- `NEXT_PUBLIC_PRIVACY_POLICY_URL` — URL da Política de Privacidade (pendente Jurídico/DPO).
- `PUBLIC_LOOKUP_RATE_LIMIT_*` e `PUBLIC_SUBMIT_RATE_LIMIT_*` — limites por IP.
- `METRICS_TOKEN` — habilita `GET /metrics` (Prometheus) com `Authorization: Bearer`.

### Testar no celular (rede local)

1. Descubra o IP da máquina na rede (macOS: `ipconfig getifaddr en0`), por exemplo `192.168.0.10`.
2. No `.env`, ajuste `PUBLIC_APP_URL=http://192.168.0.10:3000` (a API compara a origem
   das requisições com esse valor) e mantenha `COOKIE_SECURE=false`.
3. Suba com `pnpm dev` (o Next escuta em todas as interfaces; se não, use
   `pnpm --filter @receita/web dev -- -H 0.0.0.0`).
4. No celular, na mesma rede Wi-Fi, abra `http://192.168.0.10:3000/l/{slug}`. Os links
   gerados no Admin já usarão o IP. A câmera ("Tirar foto") aparece em dispositivos de toque.

> As chaves de teste do reCAPTCHA funcionam em qualquer domínio, inclusive IP local.

## Produção (self-hosted)

- Imagens: `apps/api/Dockerfile` e `apps/web/Dockerfile` (build a partir da raiz).
- Migrations como job separado: `pnpm db:migrate:deploy`.
- Proxy de borda obrigatório (TLS, `/api/*` direto para a API, `X-Forwarded-For`
  sobrescrito): veja `infra/caddy/Caddyfile.example` e `docs/decisions.md` (D-035).
- Variáveis: `NODE_ENV=production`, `COOKIE_SECURE=true`, `PATIENT_PROVIDER=none` até
  a API de pacientes existir, segredos via orquestrador/secret manager.

## Infraestrutura sem Docker

É possível usar serviços instalados localmente (ex.: via Homebrew no macOS):

```bash
brew install postgresql@17 redis seaweedfs mailpit
brew services start postgresql@17 && brew services start redis
```

Crie o usuário e os bancos (ajuste a porta se o seu Postgres não estiver em 5432):

```sql
CREATE ROLE receita LOGIN PASSWORD 'receita_dev' CREATEDB;
CREATE DATABASE receita OWNER receita;
CREATE DATABASE receita_test OWNER receita;
```

SeaweedFS com gateway S3 (o arquivo de identidades usa as mesmas credenciais de
`STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` do `.env`; veja `infra/seaweedfs/start.sh`):

```bash
weed server -dir=/caminho/dados -s3 -s3.port=8333 -s3.config=/caminho/s3.json \
  -ip=127.0.0.1 -ip.bind=127.0.0.1
mailpit   # SMTP em 1025, UI em http://localhost:8025
```

Atualize `DATABASE_URL`/`TEST_DATABASE_URL` no `.env` se usar outra porta. O Redis é
compatível com o Valkey usado no Compose.

## Estrutura

```
apps/
  api/        NestJS — REST, auth, RBAC, auditoria, storage
  web/        Next.js — área pública e Admin
packages/
  shared/     enums de domínio, schemas Zod, CPF e mascaramento
  config/     tsconfig, ESLint e Prettier compartilhados
infra/        scripts de apoio ao docker-compose
docs/         decisões técnicas e referências de design
img/logo/     única origem dos logotipos oficiais
```
