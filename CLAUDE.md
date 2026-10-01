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
- `packages/shared` — enums de domínio, schemas Zod dos contratos (usados na API e no web),
  CPF e mascaramento. Compilado com `tsc` para `dist/` (rode `pnpm build` após alterar).
- `packages/config` — tsconfig/ESLint/Prettier compartilhados.

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
