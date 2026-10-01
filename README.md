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
| `pnpm db:migrate`        | Cria/aplica migrations em desenvolvimento                            |
| `pnpm db:migrate:deploy` | Aplica migrations pendentes (produção/CI)                            |
| `pnpm db:seed`           | Popula dados de desenvolvimento                                      |
| `pnpm db:reset`          | Recria o banco de desenvolvimento do zero                            |
| `pnpm format`            | Prettier                                                             |

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
