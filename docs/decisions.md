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

---

## D-021 — Sessões server-side e cookie

- **Data:** 2026-10-01
- **Decisão:** token opaco de 32 bytes (CSPRNG) no cookie `__Host-rv_session` (`rv_session` em dev sem TLS), `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Max-Age` (cookie de sessão do navegador). O banco guarda só o SHA-256. Expiração por inatividade (30 min) e absoluta (12 h), configuráveis; renovação deslizante no máximo 1×/min. Após a verificação TOTP ou a configuração obrigatória de 2FA, a sessão é **rotacionada** (novo token; a anterior revogada) para impedir fixação de sessão. Sessões são revogadas em logout, redefinição de senha, ativação de 2FA (demais sessões), desativação de usuário e por ação do Admin.
- **Descartado:** JWT em cookie (não revogável sem lista de bloqueio).

## D-022 — Proteção CSRF

- **Data:** 2026-10-01
- **Decisão:** em todo método que altera estado: (1) `Origin`, se presente, deve ser igual à origem de `PUBLIC_APP_URL`; (2) `Sec-Fetch-Site: cross-site` é rejeitado; (3) com sessão, header `X-CSRF-Token` = HMAC(SESSION_SECRET, sessionId), comparado em tempo constante. O token é entregue no login, na verificação 2FA e em `GET /auth/me`, e muda a cada rotação de sessão.

## D-023 — Login sem enumeração e com bloqueio progressivo

- **Data:** 2026-10-01
- **Decisão:** resposta única `401 INVALID_CREDENTIALS` para usuário inexistente, inativo, sem senha, bloqueado ou senha errada — inclusive quando a conta está bloqueada e a senha está correta. Para usuário inexistente, um Argon2 contra hash fictício iguala o tempo. Bloqueio por conta: 5 falhas → 60 s, dobrando até 30 min; zera no sucesso. Rate limit por IP (10 falhas/15 min) com `429` + `Retry-After`. Falhas de 2FA também contam para o bloqueio; 5 códigos inválidos descartam a sessão intermediária. A auditoria registra o motivo interno da falha (sem e-mail digitado nem senha).

## D-024 — TOTP

- **Data:** 2026-10-01
- **Decisão:** otplib 13 (RFC 6238, SHA-1/30 s/6 dígitos — compatível com Google Authenticator), tolerância de ±1 período. Proteção contra replay: o último time-step aceito é gravado com update condicional; um código nunca é aceito duas vezes. 10 códigos de recuperação de 10 caracteres (alfabeto sem ambíguos, ~50 bits), uso único, hash vinculado ao usuário. Desativar exige senha + código e é bloqueado quando o 2FA é obrigatório. A configuração obrigatória tem janela de 15 min; a verificação no login, `MFA_PENDING_TTL_MINUTES` (5).

## D-025 — Recuperação de senha

- **Data:** 2026-10-01
- **Decisão:** `POST /auth/forgot-password` sempre responde `202` com a mesma mensagem e processa em segundo plano (tempo de resposta igual para e-mail existente ou não). Rate limit por IP (10/h) e por e-mail (3/h, chave HMAC do e-mail). Token de 32 bytes, 30 min, uso único (consumo condicional), apenas hash persistido; nova solicitação invalida a anterior. O link usa **fragmento** (`/redefinir-senha#token=…`), que não é enviado ao servidor nem vaza por `Referer`/logs. A redefinição invalida todas as sessões. Convites usam o mesmo mecanismo (`purpose = INVITE`, 72 h, `/definir-senha#token=…`).

## D-026 — `Cache-Control: no-store` em toda a API

- **Data:** 2026-10-01
- **Decisão:** toda resposta da API é marcada `no-store` (dados pessoais e de saúde não devem ficar em caches de navegador ou proxy).

---

## D-027 — Modelo de permissões e escopo de loja

- **Data:** 2026-10-01
- **Decisão:** matriz `ROLE_PERMISSIONS` em `packages/shared` (fonte única para backend e navegação do frontend). Guards globais: autenticação → CSRF → `@RequirePermissions(...)`. Escopo de loja (`StoreScopeService`) aplicado **na consulta** (`storeWhere`/`storeIdWhere`); todo `store_id` vindo do cliente passa por `assertStoreInScope`. Semântica de erro: `store_id` fora do escopo no corpo da requisição → `403` auditado (`authz.denied`), sem revelar se a loja existe; recurso de outra loja acessado por ID → `404` (indistinguível de inexistente). Toda negação de permissão é auditada com resultado `DENIED`.

## D-028 — Proteções na gestão de usuários

- **Data:** 2026-10-01
- **Decisão:** o Admin não pode desativar a si mesmo nem alterar o próprio perfil; o sistema impede remover/rebaixar o último Admin ativo. Promover a Admin remove os vínculos de loja e torna o 2FA obrigatório (salvo indicação explícita). Rebaixar exige informar lojas. Desativar revoga todas as sessões. Admin pode revogar sessões e resetar o 2FA de um usuário (perda do autenticador), ambos auditados. Reenvio de convite só para usuários sem senha definida.

---

## D-029 — Importação de lojas por CSV

- **Data:** 2026-10-01
- **Decisão:** `POST /admin/stores/import` (multipart, campo `file`, máx. 2 MB e 5.000 linhas). Delimitador `,` ou `;` detectado pelo cabeçalho (Excel pt-BR usa `;`), BOM aceito, cabeçalhos sem distinção de caixa. `active` aceita true/false, sim/não, 1/0, ativo/inativo. UF validada contra a lista oficial. Valores que começam com `=`, `+`, `@`, TAB ou CR são rejeitados (prevenção de CSV injection em exportações futuras). Linhas válidas são aplicadas numa única transação com upsert por `store_number` (o slug existente é preservado); inválidas vão para o relatório com linha e campo. `?dryRun=true` valida sem gravar (pré-visualização na UI). A auditoria registra apenas contagens, nunca o conteúdo do arquivo.

## D-030 — Slug público da loja

- **Data:** 2026-10-01
- **Decisão:** 12 caracteres base62 do CSPRNG (~71 bits), gerado na criação e imutável (não muda em reimportações), para não invalidar QR Codes e links já divulgados. URL pública = `PUBLIC_APP_URL` + `/l/{slug}`; o domínio final está pendente (PRD §42.2). Lojas inativas permanecem com o slug, mas `storeAcceptsSubmissions()` retorna falso — usado pela validação de links agora e pelo envio público na Fase 2.

---

## D-031 — Links personalizados: geração, status e consumo

- **Data:** 2026-10-01
- **Decisão:** token de 32 bytes (`crypto.randomBytes`) em base64url, gerado só no backend; persiste-se apenas o SHA-256. A URL `/p/{token}` é devolvida **uma única vez** na resposta de criação e não aparece em listagens, logs (path redigido — D-006) nem auditoria. Loja (escopo + ativa) e paciente (`PatientProvider.findByExternalId`) são validados no backend; o cliente nunca define o rótulo do paciente. Status persistido `ACTIVE | USED | REVOKED`; **`EXPIRED` é derivado** de `expires_at` na leitura (`deriveLinkStatus`), inclusive nos filtros da listagem — sem job. Revogação e consumo usam update condicional (`status = ACTIVE AND expires_at > now()`): atômicos sob concorrência. Consumo idempotente por `used_submission_id` e aceita transação externa (Fase 2 cria a receita e consome o link na mesma transação). Link expirado não pode ser revogado (já está inativo).

## D-032 — Erro neutro único na validação do token

- **Data:** 2026-10-01
- **Decisão:** `PatientLinkAccessService.resolve` retorna o mesmo `404 LINK_UNAVAILABLE` ("Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.") para token malformado, inexistente, expirado, revogado, utilizado **ou de loja inativa**. Tratar loja inativa como link indisponível evita revelar o estado da loja e mantém a mensagem neutra exigida pelo CA-014.

## D-033 — PatientProvider

- **Data:** 2026-10-01
- **Decisão:** abstração `PatientProvider` com os quatro métodos do PRD §27 mais `findByExternalId` (necessário para validar o paciente escolhido). `PATIENT_PROVIDER=mock` usa 6 pacientes **fictícios** (CPFs sintéticos com dígitos verificadores válidos), proibido em produção; `none` responde `503` "consulta de pacientes temporariamente indisponível" (PRD §33). Resultados de busca saem já mascarados (nome + inicial, CPF com 2 últimos dígitos, telefone com 4, e-mail parcial), limitados a 20, com rate limit de 30 buscas/min por usuário.

---

## D-034 — Object storage privado

- **Data:** 2026-10-01
- **Decisão:** `StorageProvider` com adapter S3 (SigV4) para SeaweedFS. Bucket sem política pública nem ACL anônima (verificado em teste: objeto e listagem sem assinatura → 403). Chaves internas `<prefixo>/<aaaa>/<mm>/<uuid>`, sem nome original nem PII. Acesso apenas por URL assinada de curta duração (`SIGNED_URL_TTL_SECONDS`, padrão 60 s, máx. 900), com `Content-Type`, `Content-Disposition` (nome saneado contra header injection, RFC 6266) e `Cache-Control: private, no-store` fixados na assinatura — qualquer alteração invalida a URL. SHA-256 do conteúdo gravado como metadado. Em dev/test o bucket é criado na inicialização; em produção deve ser provisionado. `/health/ready` verifica o bucket.
- **Pendente (infra):** criptografia em repouso do volume do SeaweedFS (LUKS ou `-encryptVolumeData`), lifecycle de retenção e antivírus assíncrono (PRD §9.4, §42.12) — Fase 2/infra.

---

## D-035 — IP do cliente e topologia de produção

- **Data:** 2026-10-01
- **Contexto:** verificado em teste manual que o rewrite `/api/*` do Next.js repassa o `X-Forwarded-For` enviado pelo cliente **sem acrescentar o IP real**. Atrás apenas do Next, a API não conhece o IP verdadeiro e um cliente poderia forjá-lo para contornar o rate limit por IP (o bloqueio por conta continua valendo).
- **Decisão:** em produção, um proxy de borda (Caddy — `infra/caddy/Caddyfile.example`) termina o TLS, **sobrescreve** `X-Forwarded-For` com o IP real e encaminha `/api/*` **diretamente** para a API; `TRUST_PROXY=1`. API e web não ficam expostas fora da rede interna. O rewrite do Next é mantido apenas como conveniência de desenvolvimento.
- **Descartado:** confiar em `loopback` (aceitaria o valor forjado) ou remover o header no Next (todos os usuários compartilhariam a mesma chave de rate limit).

## D-036 — Frontend: tokens, marca e segurança

- **Data:** 2026-10-01
- **Decisão:** tokens semânticos em CSS variables num único arquivo (`apps/web/src/styles/tokens.css`) com valores **neutros provisórios** marcados `TODO(marca)`, contraste AA verificado; a paleta padrão do Tailwind é desligada (`--color-*: initial`) para impedir cores fora do Design System. Fonte do sistema (sem Google Fonts: nenhum dado do usuário trafega para terceiros). O logotipo oficial já existe em `/img/logo/` e é copiado para `public/brand` (gitignored) no `dev`/`build` — fonte única preservada; o arquivo `logo_venancio_tiktok.png` não é usado (aguarda aprovação). CSP com nonce por requisição em `proxy.ts` (Next 16), `strict-dynamic`, `frame-ancestors 'none'`, `style-src-attr 'unsafe-inline'` (posicionamento dos primitivos Radix), `upgrade-insecure-requests` apenas sob HTTPS. `/p/*`, `/redefinir-senha` e `/definir-senha` com `no-store` + `no-referrer`. O token do link gerado só existe em memória no componente de geração. O `?next=` do login aceita apenas caminhos internos `/admin` (anti open redirect).

## D-037 — ESLint 10 e eslint-plugin-react

- **Data:** 2026-10-01
- **Contexto:** `eslint-plugin-react` 7.37 (via `eslint-config-next`) chama `context.getFilename`, removido no ESLint 10, ao detectar a versão do React.
- **Decisão:** declarar `settings.react.version` explicitamente no `eslint.config.mjs` do web. Revisitar quando o plugin suportar ESLint 10.

---

# Fase 2 — Envio público

## D-038 — Correção: mascaramento de CPF alterava UUIDs

- **Data:** 2026-10-01
- **Contexto:** o padrão de CPF do `scrubString` exigia apenas fronteira não numérica; blocos hexadecimais de UUID com 11 dígitos seguidos eram mascarados (ex.: `…-06220079670c` → `…-***.***.***-**c`), corrompendo IDs em logs e em `audit_logs.metadata` (append-only, irreversível). Falha intermitente detectada na Fase 2.
- **Decisão:** a fronteira passa a ser não alfanumérica (`(?<![0-9A-Za-z])` / `(?![0-9A-Za-z])`). CPFs em texto livre continuam mascarados; testes cobrem UUIDs com 11/12 dígitos. Registros afetados existem apenas no banco de desenvolvimento local.

## D-039 — Contexto público e loja inativa

- **Data:** 2026-10-01
- **Decisão:** `GET /public/stores/{slug}` retorna somente número, nome e `acceptsSubmissions`; loja inativa → `acceptsSubmissions: false` (a tela exibe a mensagem do DESIGN §6.10, CA-010); slug inexistente → 404 neutro. A busca pública lista apenas lojas ativas (até 20). No **link personalizado**, loja inativa continua indistinguível de link inválido (D-032, aprovado na Fase 2). `GET /public/patient-links/{token}` devolve apenas a loja e audita a abertura (`patient_link.opened`) sem o token. Rate limit por IP configurável (`PUBLIC_LOOKUP_*`, `PUBLIC_SUBMIT_*`); clientes no Wi-Fi da loja compartilham IP, por isso o limite de envio é generoso. Token mascarado também no log de acesso do Caddy e nos logs de requisição do `next dev`.

## D-040 — Captcha (reCAPTCHA v2 checkbox)

- **Data:** 2026-10-01
- **Decisão:** interface `CaptchaVerifier` com adapter `RecaptchaV2Verifier` (PRD §10.4); trocar por reCAPTCHA Enterprise = novo adapter, sem mudar o domínio. A verificação exige `success`, hostname em `RECAPTCHA_EXPECTED_HOSTNAMES` e token **não reutilizado**: o hash do token é reservado no Redis (`SET NX`, 5 min) **antes** da chamada ao Google — necessário porque as chaves de teste sempre aprovam e para barrar reuso concorrente. Indisponibilidade do Google → falha fechada (envio recusado). Falhas geram log de segurança (`captcha_rejected` + motivo) e a métrica `captcha_verifications_total{result}`, sem dados pessoais. Dev/teste usam as chaves de teste oficiais (hostname `testkey.google.com`); a API recusa a chave de teste e esse hostname em produção. Os testes e2e da API usam um verificador falso offline; o adapter real tem testes unitários com `fetch` simulado.
- **Pendente (DPO):** o reCAPTCHA envia IP e cookies ao Google — validar base legal e menção no aviso de privacidade.

## D-041 — Métricas Prometheus

- **Data:** 2026-10-01
- **Decisão:** `prom-client` com `GET /metrics` exigindo `Authorization: Bearer METRICS_TOKEN` (sem token configurado o endpoint responde 404); exposto apenas na rede interna. Latência por **template** de rota (`/public/patient-links/:token`), nunca a URL concreta; contadores de captcha, envios, arquivos aceitos/rejeitados, falhas de storage e eventos de segurança, apenas com labels categóricos.

## D-042 — Transporte do upload

- **Data:** 2026-10-01
- **Decisão:** `multipart/form-data` direto à API, processado em **streaming** com busboy. Limites aplicados pelo parser antes de bufferizar: 10 arquivos, 5 MB por arquivo, 10 campos de texto de até 8 KB, e corpo total ≤ 10 × 5 MB + 512 KB (verificado já pelo `Content-Length`). **Os campos de texto (captcha, CPF, loja) devem vir antes dos arquivos**: a validação desses campos — incluindo o captcha e a resolução de loja/link — roda antes de qualquer byte de arquivo ser gravado, então tráfego de bot não chega ao storage. Cada arquivo: os primeiros 4.100 bytes definem o tipo real (magic bytes, `file-type`), que precisa concordar com a extensão; o restante segue em stream para o storage (`putObjectStream`, `@aws-sdk/lib-storage`, uma parte de até ~5 MB) com SHA-256 e tamanho calculados no caminho. Qualquer arquivo inválido rejeita o envio inteiro (o frontend já impede arquivos inválidos). Objetos gravados de um envio que falhou são removidos; se a remoção falhar, vão para `orphaned_objects` (limpeza futura).
- **Descartado:** bufferizar tudo em memória (até 50 MB por requisição) e upload direto do navegador ao storage com URL pré-assinada (exporia o storage ao público e dificultaria a validação antes do armazenamento).

## D-043 — Antivírus

- **Data:** 2026-10-01
- **Decisão:** interface `MalwareScanner` com adapter no-op; arquivos nascem com `malware_scan_status = PENDING`. Estratégia real pendente (PRD §42, item 12). A Fase 3 deve tratar PDFs com cautela no visualizador enquanto não houver varredura.

## D-044 — Idempotência do envio

- **Data:** 2026-10-01
- **Decisão:** header `Idempotency-Key` (16–128 caracteres `[A-Za-z0-9_-]`), gerado pelo cliente **por tentativa de envio** e reaproveitado em "Tentar novamente". Guardado só como hash (`sha256(escopo:chave)`; escopo = endpoint público ou hash do token do link) no Redis por 24 h: `processing` (reservado com `SET NX`) → `done` após o commit. Repetição com `done` devolve a mesma resposta `201 {status:"RECEIVED"}` sem ler o corpo nem criar receita; com `processing` → `409`; falha → chave liberada. O hash também vai para `prescription_submissions.idempotency_key` (único) como garantia caso o Redis perca o estado. Sem o header, o envio é processado normalmente (sem deduplicação).

## D-045 — Ordem do consumo do link na transação

- **Data:** 2026-10-01
- **Contexto:** criar a receita (FK para o link → lock compartilhado na linha) e depois atualizar o link causava **deadlock** entre envios concorrentes com o mesmo link (500 em vez do erro neutro), detectado nos testes.
- **Decisão:** `PatientLinkAccessService.consumeWithin` reivindica o link primeiro (update condicional `ACTIVE → USED`, que bloqueia a linha), cria a receita e só então grava `used_submission_id` e audita. O envio concorrente espera o lock, reavalia a condição e recebe `LINK_UNAVAILABLE`; nada é gravado e seus objetos são removidos. Falhas de captcha, arquivo ou storage acontecem antes da transação e nunca consomem o link.

## D-046 — Envio: regras de identificação, canal e eventos

- **Data:** 2026-10-01
- **Decisão:** público/genérico → `identification_status = NOT_IDENTIFIED` com ou sem CPF (identificação automática fica para a Fase 4); `source_channel = STORE_LINK` (slug) ou `GENERIC` (loja escolhida, validada como ativa). Link personalizado → aceita **apenas** `captchaToken`; qualquer outro campo (store_id, cpf, patient_id…) → `400` + auditoria `security.personalized_link_tampering` (só os nomes dos campos) + métrica. Receita nasce `RECEIVED`, com `status_history` inicial, `retention_until = agora + retention_days`, arquivos `PENDING` e, no link personalizado, `PatientLinkHistory(PERSONALIZED_LINK)`. Após o commit: `MalwareScanner.enqueue` (no-op) e evento `prescription.submitted {submissionId, storeId}` num barramento em processo (`DomainEventBus`) — a Fase 3 deve trocá-lo por Redis pub/sub/outbox. Metadados de auditoria evitam nomes de chave contendo "cpf" (seriam redigidos pela proteção de logs): usa-se `documentProvided`.

## D-047 — Contexto do link personalizado em cookie

- **Data:** 2026-10-01
- **Decisão (aprovada):** ao abrir `/p/{token}`, a página envia o token **no corpo** de `POST /public/patient-link-sessions`; a API valida (mesma regra/erro neutro), audita a abertura, gera um ID de contexto aleatório (32 bytes) e grava no Redis apenas `sha256(ID) → linkId` (30 min), definindo o cookie `__Host-rv_plink` (`rv_plink` em dev) HttpOnly + SameSite=Strict. A página substitui a URL por `/p` (`history.replaceState`) antes de carregar qualquer script de terceiros (reCAPTCHA). Consulta e envio usam `GET /public/patient-link-sessions/current` e `POST /public/patient-link-sessions/current/prescriptions`; o link é revalidado a cada chamada e o contexto é encerrado após o envio. As rotas com token no path (PRD §26.1) continuam disponíveis. `/p` e `/p/*` com `Cache-Control: no-store` e `Referrer-Policy: no-referrer`; o path com token é mascarado nos logs da API, do Caddy e do `next dev`; métricas usam o template da rota.
- **Limites:** a URL original continua na mensagem recebida (WhatsApp/e-mail) e alguns navegadores registram a URL de entrada no histórico global; o contexto é por dispositivo.

## D-048 — HEIC no cliente

- **Data:** 2026-10-01
- **Decisão:** HEIC/HEIF é aceito pela extensão no cliente (navegadores costumam informar MIME vazio para HEIC) e validado pelos magic bytes no servidor. Pré-visualização: tenta-se exibir a imagem; onde o navegador não decodifica HEIC (quase todos, exceto Safari), mostra-se o ícone do tipo de arquivo. Sem conversão nem miniatura no servidor nesta fase (fora do escopo). Object URLs são revogadas ao remover o arquivo ou desmontar o componente.

## D-049 — Aviso de privacidade provisório **[pendente Jurídico/DPO]**

- **Data:** 2026-10-01
- **Decisão:** link visível para a Política de Privacidade (`NEXT_PUBLIC_PRIVACY_POLICY_URL`, hoje `https://pendente.invalid/…`) e texto curto PROVISÓRIO em `apps/web/src/components/public/privacy-notice.tsx` (marcado `TODO(juridico)`): "Os dados e arquivos enviados são usados somente para viabilizar o atendimento da sua receita pela Drogaria Venancio." Sem checkbox de consentimento (PRD §22.2). Texto final, base legal, URL e menção ao reCAPTCHA (dados enviados ao Google) dependem do Jurídico/DPO.

## D-050 — Microcopy adicional (não prevista no DESIGN)

- **Data:** 2026-10-01
- **Decisão:** os textos do DESIGN §6.3/§7 são usados literalmente (constantes `SUBMISSION_MESSAGES`). Textos novos necessários, a validar com UX: "Arraste os arquivos ou" (área de upload no desktop); "Tentar novamente" (rótulo do botão após falha geral, mesmo lugar do "Enviar"); entrada genérica: "Selecione a loja para onde deseja enviar a receita.", "Buscar loja", "Número, nome, bairro ou endereço", "Lojas encontradas", "Nenhuma loja encontrada. Tente outro termo.", "Continuar", "Trocar loja"; contexto da loja: "Loja: {número} · {nome}" (DESIGN §13.1). No link personalizado usa-se o texto neutro do §6.8 ("Envie sua receita para a Drogaria Venancio"). Link de loja inexistente exibe a mesma mensagem de loja indisponível (§6.10), sem texto novo.

## D-051 — Formulário público: captcha, idempotência e erros

- **Data:** 2026-10-01
- **Decisão:** um único `SubmissionForm` para `/l/[slug]`, `/enviar` e `/p` (CPF só fora do link personalizado). Ordem do DESIGN §6.2. reCAPTCHA v2 em renderização explícita, script `async` com nonce, carregado após o conteúdo; CSP libera Google **apenas** nas rotas públicas de envio (`frame-src 'none'` no restante). Botão Enviar habilitado só com ≥ 1 arquivo, contexto pronto, CPF válido quando preenchido e captcha concluído (`canSubmit`); expiração do captcha desabilita o botão e mostra a mensagem do §7. Arquivos inválidos não entram na lista (aparecem num alerta com o motivo) e nunca vão ao backend. Envio por XHR com barra de progresso; `Idempotency-Key` gerada por tentativa e reaproveitada em "Tentar novamente" (nova chave se arquivos/CPF mudarem); o captcha é refeito a cada tentativa (token de uso único). Erros do servidor por arquivo marcam o arquivo e levam o foco a ele; CPF → foco no campo; falha geral → alerta com foco. Região `aria-live` anuncia arquivos adicionados/rejeitados, progresso e resultado.

## D-052 — Analytics

- **Data:** 2026-10-01
- **Decisão:** interface `AnalyticsProvider` (no-op em produção, console em dev) com os eventos públicos do PRD §29 tipados por evento. `sanitize` aceita apenas chaves de uma allowlist (`entry`, `fileType`, `reason`, `fileCount`, `durationMs`, `code`) e valores curtos sem espaços — CPF, token, nome de arquivo ou texto livre são descartados. Ferramenta de analytics definitiva: pendente.

## D-053 — E2E do frontend

- **Data:** 2026-10-01
- **Decisão:** Playwright (Chromium) em três viewports (320 px, 375 px com toque, desktop 1280 px) contra builds reais: API com `NODE_ENV=test` (permite a chave de teste do reCAPTCHA e o mock de pacientes, sem qualquer exceção na validação de produção) e web em build de produção, no banco `*_test` e prefixo Redis `rv-e2e:`. O widget **real** do reCAPTCHA com a chave de teste é usado (requer internet). Dados via seed + API do Admin. axe-core verifica as telas públicas (formulário, sucesso, loja indisponível, link inválido, seleção de loja) — nenhuma violação séria/crítica, excluindo apenas o iframe do Google. Também verifica ausência de rolagem horizontal em 320 px.

---

# Fase 3 — Operação da loja

## D-054 — Outbox transacional (substitui o barramento em processo)

- **Data:** 2026-10-01
- **Decisão (aprovada):** eventos de domínio (`prescription.submitted`, `prescription.viewed`, `prescription.status_changed`) são gravados em `outbox_events` **na mesma transação** da ação, só com IDs e campos não sensíveis. Um dispatcher no worker os entrega à fila BullMQ (processamento de anexos) e ao Redis Stream de tempo real, marcando `processed_at`. O `DomainEventBus` em processo da Fase 2 foi removido. Nenhum evento se perde se o processo cair entre o commit e a entrega.

## D-055 — Matriz de transições do status operacional

- **Data:** 2026-10-01
- **Decisão (aprovada):** em `packages/shared/src/status-matrix.ts`. Recebida → Em análise | Em atendimento | Cancelada | Não atendida; Em análise → Em atendimento | Cancelada | Não atendida; Em atendimento → Em análise (voltar) | Finalizada | Cancelada | Não atendida. Nunca volta para Recebida; finalizar só a partir de Em atendimento. Estados finais (Finalizada, Cancelada, Não atendida): reabrir → Em análise **somente Gestor e Admin** (`prescriptions:reopen`), com confirmação e auditoria `prescription.reopened`. Sem motivo em texto livre (evita dados pessoais/clínicos).

## D-056 — Exibição do CPF completo

- **Data:** 2026-10-01
- **Decisão (aprovada):** permissão isolada `prescriptions:reveal_cpf`, hoje concedida aos três perfis **dentro do escopo**. `POST /prescriptions/{id}/cpf/reveal` (`no-store`), rate limit de 30/h por usuário, auditoria `prescription.cpf_revealed` sem o valor. Na interface, o CPF fica visível por 30 s, não entra em cache do cliente nem é copiado automaticamente.

## D-058 — Keep-alive da API

- **Data:** 2026-10-01
- **Contexto:** "socket hang up" intermitente nos testes: o `keepAliveTimeout` padrão do Node (5 s) fechava conexões que o cliente reaproveitava. Provável explicação das lentidões intermitentes de ~200 s observadas nas Fases 1 e 2.
- **Decisão:** `keepAliveTimeout = 65 s` e `headersTimeout = 66 s` (maiores que o idle de proxies como Caddy/ALB), aplicados em `main.ts` e nos testes.
