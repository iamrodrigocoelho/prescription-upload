# CLAUDE.md — Receita Venancio

Aplicação web de envio e gestão de receitas médicas da Drogaria Venancio. Clientes enviam
receitas para uma loja (link público por loja ou link personalizado por paciente); a equipe
da loja trata as receitas num Admin com RBAC por loja. **O sistema trata dados pessoais
sensíveis de saúde (LGPD): segurança e privacidade são requisitos de primeira classe.**

## Governança (obrigatória)

- **`PRD.md`** é a fonte de verdade para comportamento, regras de negócio, segurança, dados,
  arquitetura e critérios de aceite.
- **`DESIGN.md`** é a fonte de verdade para UI, UX, tokens, componentes, microcopy e responsividade.
- Não invente regra de negócio. Se algo não estiver especificado: escolha a opção mais
  conservadora em segurança/privacidade, registre em `docs/decisions.md` (data, contexto,
  decisão, alternativa descartada) e sinalize ao usuário.
- Se um requisito conflitar com uma limitação técnica, pare e pergunte.
- Logotipos vêm **exclusivamente** de `/img/logo/`. Screenshots em `/docs/design/references/`
  são referência de UX, nunca assets; **nunca** use o azul ou elementos da Dasa.

## Comandos

```bash
pnpm dev | build | lint | typecheck | test | test:e2e
pnpm db:migrate | db:seed | db:reset
pnpm --filter @receita/api <script>     # rodar script de um pacote
```

Antes de cada commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` verdes.
Não avance de etapa com testes quebrados.

## Arquitetura

- `apps/api` — NestJS 12, **ESM** (imports relativos terminam em `.js`). Estrutura:
  `config/` (env validado com Zod), `common/` (logger, contexto, filtros, pipes, guards,
  decorators), `infra/` (prisma, redis, crypto, mail, storage), `modules/<domínio>/`.
- `apps/web` — Next.js App Router; grupos `(public)`, `(auth)`, `(admin)`. Chama a API pela
  mesma origem (`/api/*` → proxy para a API).
- `apps/web` (detalhes) — Next.js 16: `src/proxy.ts` (antigo middleware) aplica a CSP com
  nonce; `src/styles/tokens.css` é o ÚNICO lugar com valores visuais (cores do Tailwind
  padrão estão desligadas); componentes em `src/components/ui`; chamadas à API via
  `src/lib/api.ts` (envia o CSRF); permissões de UI via `navItemsFor`/`useSession().can`.
- `packages/shared` — enums de domínio, schemas Zod dos contratos (usados na API e no web),
  CPF e mascaramento. Compilado com `tsc` para `dist/` (rode `pnpm build` após alterar).
- `packages/config` — tsconfig/ESLint/Prettier compartilhados.

## Fase 2 — área pública (módulos e convenções)

- API: `modules/public` (contexto de loja/link e contexto do link em cookie),
  `modules/submissions` (receptor multipart em streaming, `FileValidator` por magic bytes,
  idempotência, limpeza de órfãos), `modules/captcha` (`CaptchaVerifier` → reCAPTCHA v2),
  `modules/malware` (`MalwareScanner`, usado pelo worker) e `infra/metrics` (Prometheus).
- Envio multipart: **campos de texto antes dos arquivos** (captcha/loja/link validados antes
  de gravar qualquer byte). Link personalizado aceita só `captchaToken`.
- Link personalizado: reivindique o link ANTES de criar a receita na transação
  (`PatientLinkAccessService.consumeWithin`) — o inverso causa deadlock.
- Metadados de auditoria: não use chaves contendo "cpf"/"token"/"secret" (são redigidas).
- Web: `components/public` (formulário único das três entradas), `lib/submission`
  (`canSubmit`, `addFiles`, `cpfFieldState`, envio XHR), `lib/analytics` (allowlist de
  payload). Textos do DESIGN em `SUBMISSION_MESSAGES` (`packages/shared/src/upload.ts`).
- CSP: Google (reCAPTCHA) liberado apenas em `/l`, `/p` e `/enviar` (`src/proxy.ts`).
- E2E do web: `apps/web/e2e` (Playwright, viewports 320/375/desktop, axe). Rode com
  `pnpm test:e2e:web` (portas 3000/4000 livres; banco `*_test`).

## Fase 3 — operação da loja (módulos e convenções)

- API: `modules/prescriptions` (fila com cursor, detalhe, status, URLs de anexos, CPF),
  `modules/outbox` (`OutboxService.add(tx, …)` + `OutboxDispatcher`), `modules/attachments`
  (BullMQ, derivados HEIC/JPEG, `WorkerRunner`), `modules/realtime` (SSE: `RealtimeHub`,
  `RealtimePublisher` em Redis Stream, `RealtimeControl` para encerrar streams).
- **Processo worker** separado: `src/worker.ts` / `worker.module.ts` (`node dist/worker.js`).
- Eventos de domínio: SEMPRE via `outboxService.add(tx, …)` dentro da transação da ação —
  nunca emitir direto. Payloads só com IDs e campos não sensíveis.
- Qualquer revogação/desativação/mudança de escopo deve chamar `RealtimeControl`
  (`invalidateSession`/`invalidateUser`) para fechar streams SSE.
- Receita fora do escopo = 404 (`PrescriptionsService.findScoped`). Arquivo só via
  `PrescriptionFilesService.signedUrl` (checa escopo + vínculo arquivo↔receita + status `CLEAN`).
- Matriz de status em `packages/shared/src/status-matrix.ts` (frontend e backend).
- Ordem dos anexos: `prescription_files.position` (não ordenar por `created_at`).
- Web: `lib/realtime.tsx` (`RealtimeProvider`/`useRealtime`), `lib/prescriptions.ts`
  (filtros na URL), `components/admin/prescriptions/*`, `components/admin/notification-center.tsx`,
  `lib/sound-gate.ts` (som em uma aba). CSP do Admin libera só a origem do storage.
- E2E do Admin: `apps/web/e2e/admin-operations.spec.ts` (desktop; sobe API, worker e web).
- Migrations: `prisma migrate dev` é interativo; neste ambiente gere com
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
  confira que o arquivo não está vazio e aplique com `migrate deploy`.

## Fase 4 — pacientes e dashboard (módulos e convenções)

- API: `modules/patients` (`PatientProvider` + `ResilientPatientProvider`, `PatientSelectionService`,
  busca com contexto), `modules/patient-identification` (fila BullMQ do worker, identificação
  por CPF), `modules/prescriptions/prescription-patient-link.service.ts` (vínculo manual),
  `modules/dashboard` (SQL agregado por escopo).
- Adapters devolvem SOMENTE `PatientSummary` (mascarado); mapeie a resposta da API com
  `toPatientSummary` e traduza falhas em `PatientProviderError`. Novo adapter deve passar
  `test/contracts/patient-provider.contract.ts`.
- O cliente nunca envia `patient_external_id`: busca → `selectionRef` (Redis, presa a usuário,
  sessão e contexto) → vínculo/geração de link resolvem no backend.
- Vínculos (automático e manual) usam update condicional (`patient_external_id IS NULL AND
identification_status = NOT_IDENTIFIED`) + `PatientLinkHistory` + auditoria + outbox
  `prescription.patient_linked`. Não alteram `version` (exclusiva do status operacional).
- Datas: conexões Postgres em UTC via `createPgAdapter` (nunca `new PrismaPg` direto);
  agrupamentos por dia com `AT TIME ZONE` + `APP_TIMEZONE`.
- Testes e2e: a tabela `audit_logs` não é limpa entre testes — filtre pelo que o teste criou
  (usuário, loja, entidade) em vez de "o último registro".
- Web: `components/admin/patients/patient-search.tsx` (busca compartilhada),
  `components/admin/prescriptions/link-patient-dialog.tsx`, `components/admin/dashboard/*`
  (gráficos SVG próprios), `lib/dashboard.ts`. E2E: `admin-patients.spec.ts`,
  `admin-dashboard.spec.ts`.

## Fase 5 — segurança de anexos

- `MalwareScanner` é o port para antivírus; ClamAV é o adapter padrão. `test-clean` só roda em
  `NODE_ENV=test`. A API só emite URL para `CLEAN`; falha de scanner, pendência e legado
  `NOT_SCANNED` ficam bloqueados. O worker isola infectados em `quarantine/`, exclui o
  original/derivados e audita o evento.
- Comandos: `pnpm --filter @receita/api rescan` (relatório), `... rescan --apply` (re-scan),
  `... rescan --retry-quarantine --apply` (retoma isolamento). O teste EICAR real requer
  `CLAMAV_REAL_TEST=1` com daemon e assinaturas; veja `docs/security/antivirus.md`.

## Convenções de código

- TypeScript strict; sem `any` implícito; sem `console.*` (use o logger do Nest/pino).
- Validação de toda entrada no backend com Zod (`ZodValidationPipe`), mesmo quando o
  frontend também valida.
- Erros: lance `AppError(ApiErrorCode.X)`; o filtro global padroniza a resposta
  `{ error: { code, message, requestId } }`.
- Na API, **não** use `import type` para classes injetadas (quebra a DI com decorator metadata).
- Testes: unitários junto ao código (`*.spec.ts` na API, `*.test.ts` no shared); e2e em
  `apps/api/test/*.e2e-spec.ts`.
- Microcopy em português do Brasil, conforme `DESIGN.md`.

## Commits

Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`), com escopo
quando útil: `feat(api): ...`, `feat(web): ...`, `chore(infra): ...`.

## Regras de segurança inegociáveis

- **Nunca** registrar CPF integral, tokens, senhas, segredos TOTP ou conteúdo de receita em
  logs, analytics ou mensagens de erro. O logger já redige chaves sensíveis e padrões de CPF,
  mas não confie só nisso: não passe esses dados ao logger.
- Autorização **sempre** no backend, em todas as rotas (guards globais, nega por padrão; rota
  pública exige `@Public()` explícito). O frontend apenas reflete permissões.
- Escopo de loja aplicado **na consulta** (anti-IDOR). Nunca confie em `store_id` do cliente
  sem validar o escopo do usuário.
- Respostas públicas não revelam existência de usuário, paciente ou link (mensagens neutras e
  idênticas para todos os casos de falha).
- Tokens (sessão, reset, link personalizado) são persistidos apenas como hash; o valor puro
  sai do backend uma única vez.
- `cpf_encrypted` e `totp_secret_encrypted` com AES-256-GCM; `cpf_hash_for_lookup` com
  HMAC-SHA256 + pepper. Chaves só via variáveis de ambiente.
- `AuditLog` é append-only (trigger no banco bloqueia UPDATE/DELETE). Toda ação do PRD §23
  existente deve gerar evento com os campos mínimos.
- Nenhum segredo no código. Novas variáveis vão para `.env.example`, documentadas, e para o
  schema em `apps/api/src/config/env.ts`.
