# Registro de decisões técnicas

Formato: data · contexto · decisão · alternativa descartada.
Decisões que dependem de validação do negócio estão marcadas com **[pendente negócio]**.

---

## D-001 — Stack 100% open source e hospedagem própria

- **Data:** 2026-10-01
- **Contexto:** a aplicação será hospedada em infraestrutura própria, sem nuvem pública no primeiro momento.
- **Decisão:** PostgreSQL 17, Valkey 8 (fork BSD do Redis, compatível no protocolo), SeaweedFS (Apache-2.0) como object storage S3-compatible, Mailpit (dev) e SMTP genérico via nodemailer (prod). O client `@aws-sdk/client-s3` (Apache-2.0) é usado apenas como implementação do protocolo S3, sem dependência de AWS.
- **Descartado:** MinIO (edição community arquivada em 2026, sem manutenção); Redis ≥ 7.4 (licença RSAL/SSPL); RustFS (alpha, não recomendado para produção pelo próprio projeto).

## D-002 — Node 24 LTS fixado por projeto

- **Data:** 2026-10-01
- **Contexto:** o Node 22.13 do sistema falha ao executar o CLI do NestJS 12 (`ERR_REQUIRE_CYCLE_MODULE`).
- **Decisão:** `devEngines.runtime` no `package.json` raiz com `onFail: download` — o pnpm baixa e usa Node 24.21.0 apenas neste repositório. `.nvmrc` acompanha.
- **Descartado:** alterar o Node global da máquina.

## D-003 — TypeScript 6.0 (não 7.0)

- **Data:** 2026-10-01
- **Contexto:** TypeScript 7 (compilador nativo) é a versão `latest`, mas o `typescript-eslint` suporta `<6.1`.
- **Decisão:** TypeScript `~6.0.3`, `strict` em todo o monorepo (+ `noUncheckedIndexedAccess`).
- **Descartado:** TS 7 sem lint type-aware.

## D-004 — NestJS 12 em ESM; Vitest em todo o monorepo

- **Data:** 2026-10-01
- **Decisão:** a API segue o template oficial do Nest 12 (`"type": "module"`, `module: nodenext`, imports com `.js`). Testes com Vitest (unitários `*.spec.ts`/`*.test.ts`, e2e `test/*.e2e-spec.ts` com supertest, execução serial).
- **Descartado:** Jest (configuração ESM mais frágil).

## D-005 — Política de supply chain do pnpm mantida

- **Data:** 2026-10-01
- **Contexto:** o pnpm 11 recusa versões publicadas há menos de 24 h (`minimumReleaseAge`).
- **Decisão:** não criar exceções; os ranges são ajustados para resolver versões maduras.

## D-006 — Logs sem dados sensíveis

- **Data:** 2026-10-01
- **Decisão:** pino com três camadas: (1) serializer de requisição registra apenas método, path e ID — **query strings nunca são logadas** e segmentos de token (`/p/{token}`, `/public/patient-links/{token}`) são substituídos por `[REDACTED]`; (2) `formatters.log` remove recursivamente chaves sensíveis (`password`, `*token*`, `*secret*`, `*cpf*`, `totp*`, `code`, `cookie`, `authorization`…); (3) qualquer string com padrão de CPF é mascarada. Erros 5xx são logados com stack; o cliente recebe apenas código + mensagem genérica + `requestId`.

## D-007 — Correlation ID

- **Data:** 2026-10-01
- **Decisão:** header `X-Request-Id` aceito do cliente apenas se for UUID (evita log injection); caso contrário, gerado no servidor. Devolvido na resposta e incluído em todo log e em todo `AuditLog`.

## D-008 — Mesma origem entre web e API

- **Data:** 2026-10-01
- **Decisão:** o Next.js faz proxy de `/api/*` para a API. Cookies são first-party, sem CORS habilitado na API.
- **Descartado:** API em subdomínio com CORS + cookies cross-site.

---

## Decisões aprovadas no planejamento (implementadas nas etapas indicadas)

## D-009 — 2FA obrigatório por padrão para administradores **[pendente negócio: PRD §42.7]**

- **Decisão:** `totp_required = true` por padrão para usuários `ADMIN`; demais perfis opcional, com o Admin podendo exigir por usuário. No seed de desenvolvimento, controlado por `SEED_ADMIN_TOTP_REQUIRED`.

## D-010 — Rótulo mascarado do paciente no link personalizado

- **Decisão:** ao gerar o link, persiste-se `patient_display_label` já mascarado (ex.: "João S. · CPF _**.**_.***-12"). A listagem não consulta a API de pacientes a cada exibição e não armazena PII em claro.
- **Descartado:** consultar o provider a cada listagem (acoplamento e indisponibilidade).

## D-011 — Busca de pacientes via `POST /patients/search`

- **Decisão:** o termo de busca (CPF, telefone ou e-mail) vai no corpo, não na URL, evitando registro em logs de proxy e histórico. Rate limit por usuário; auditoria registra apenas o tipo de busca, nunca o termo.
- **Descartado:** `GET /patients/search?cpf=` (PRD §26.4, conceitual).

## D-012 — Criação de usuário por convite

- **Decisão:** o Admin não define senha. O usuário recebe e-mail com token de uso único (72 h) para definir a própria senha. Política mínima: 12 caracteres (configurável).

## D-013 — Validade do link personalizado **[pendente negócio: PRD §42.13]**

- **Decisão:** opções de 1, 3, 7, 15 e 30 dias; padrão 7 (`patient_link_default_expiry_days`), teto em `patient_link_max_expiry_days` (30).

## D-014 — Visibilidade de links e lojas

- **Decisão:** dentro do escopo, qualquer usuário vê e revoga links da loja (não só os que gerou). O menu Lojas aparece para todos os perfis em modo leitura (copiar link público); importação e edição são exclusivas do Admin.

## D-015 — Escopo mínimo por perfil

- **Decisão:** Colaborador e Gestor exigem ao menos 1 loja; Admin não possui vínculos (acesso global).

---

## D-016 — Entidades técnicas de autenticação e configuração

- **Data:** 2026-10-01
- **Contexto:** o PRD §25 não modela sessão, recuperação de senha, códigos de recuperação do 2FA nem parâmetros globais.
- **Decisão:** além das entidades do PRD, o schema inclui `Session` (sessão server-side revogável; só o hash do token), `PasswordResetToken` (uso único, `purpose` RESET/INVITE; só o hash), `TotpRecoveryCode` (uso único; só o hash) e `SystemSetting` (chave/valor JSONB). Campos extras em entidades do PRD: `User.totp_pending_secret_encrypted`, `totp_required`, `totp_last_used_step`, `failed_login_count`, `locked_until`, `last_login_at`, `password_changed_at`; `UserStoreAccess.created_by_user_id`; `PatientUploadLink.patient_display_label`, `used_submission_id`; `PrescriptionSubmission.idempotency_key`; `AuditLog.actor_role`, `result`, `correlation_id`. `User.password_hash` é nulo até a definição de senha pelo convite. Campos de OCR (PRD §28) ficam para migration futura.
- **Descartado:** sessões JWT stateless (não revogáveis).

## D-017 — AuditLog append-only no banco

- **Data:** 2026-10-01
- **Decisão:** trigger `BEFORE UPDATE OR DELETE` (por linha) e `BEFORE TRUNCATE` (por statement) que lançam exceção para qualquer role. `AuditLog` não tem FKs (o registro sobrevive a mudanças nas entidades). O `AuditService` só expõe inserção; eventos podem ser gravados na mesma transação da ação.
- **Recomendação para produção:** a aplicação deve conectar com um role sem privilégio de DDL (sem ser dono das tabelas), com `INSERT, SELECT` em `audit_logs`, para que o trigger não possa ser removido pela própria aplicação. Migrations rodam com um role separado.

## D-018 — Criptografia de campos com contexto (AAD) e formato versionado

- **Data:** 2026-10-01
- **Decisão:** AES-256-GCM com IV de 96 bits aleatório, tag de 128 bits e formato `v1:<iv>:<tag>:<ciphertext>` (base64url). O nome do campo entra como AAD — um texto cifrado de CPF não decifra como segredo TOTP. CPF e TOTP usam chaves distintas. Senhas: Argon2id (m=64 MiB, t=3, p=4 — RFC 9106).

## D-019 — Restrições reforçadas no banco

- **Data:** 2026-10-01
- **Decisão:** CHECKs para e-mail minúsculo, UF, coerência de status do link (USED ⇒ `used_at`; REVOKED ⇒ `revoked_at`), expiração posterior à criação, tamanho de arquivo positivo e **retenção ≥ 365 dias** em `system_settings`. Os parâmetros iniciais (retenção 365, validade padrão 7, máxima 30) são inseridos pela própria migration, existindo em todos os ambientes.

## D-020 — Banco de testes sem operações destrutivas de schema

- **Data:** 2026-10-01
- **Contexto:** o Prisma bloqueia `migrate reset` quando executado por agente de IA sem consentimento explícito.
- **Decisão:** a suíte e2e aplica migrations com `prisma migrate deploy` (não destrutivo) e limpa dados com `TRUNCATE` entre suítes; só roda em bancos cujo nome termina em `_test`. `pnpm db:reset` continua disponível para uso humano.
