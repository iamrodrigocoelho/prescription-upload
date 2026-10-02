# Segurança no CI

O workflow [CI](../../.github/workflows/ci.yml) executa em `push` para `main`,
`pull_request` e manualmente. Nenhum job usa dados reais. As chaves de teste são
geradas no runner, o banco é `receita_test` e a suíte EICAR usa o arquivo de
teste oficial do antivírus.

O pnpm bloqueia dependências transitivas de fontes externas, exige publicação
com pelo menos sete dias para **novas resoluções** e impede queda de nível de
confiança do publicador. O lockfile já existente foi auditado com `pnpm audit`
e Trivy antes da ativação; `trustLockfile: true` evita reprovar suas versões
anteriores à nova política. Mudanças no lockfile exigem revisão de dependências
e do resultado dos scans no PR. Este aceite transitório não substitui a revisão
de Segurança antes de produção.

| Job             | Bloqueio                                                                     | Evidência                                        |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| quality-and-e2e | Lint, tipos, testes, E2E da API e navegador, `pnpm audit --audit-level high` | Log do job; inclui EICAR com ClamAV real         |
| sast            | Semgrep CE com regras OWASP Top 10 (`--error`)                              | Log do job e achados identificados por regra      |
| secrets         | Gitleaks no código e histórico (`fetch-depth: 0`)                            | Log do job; sem artefatos com valores de secrets |
| image-security  | Trivy em cada imagem, falha para HIGH/CRITICAL                               | Log e SBOM CycloneDX por imagem (30 dias)        |
| dast-staging    | ZAP baseline; executa só se `STAGING_URL` estiver configurada                | Relatório ZAP; sem criação automática de issue   |

## Falsos positivos e exceções

1. Reproduzir o achado na versão exata do lockfile, commit ou imagem; guardar
   identificador da regra/CVE, caminho, evidência e impacto no ticket.
2. Segurança da Informação confirma se o dado é sintético, se o código é
   alcançável e se existe correção. Dependência indireta exige análise do pacote
   que a introduz. Para secrets reais, revogar/rotacionar imediatamente; remover
   só do HEAD não elimina o histórico.
3. Corrigir primeiro. Uma supressão só pode ser pontual, justificada, com
   responsável e data de revisão. Registrar em `docs/security/assessment.md` e
   no backlog; não desligar job nem baixar o limiar global.
4. Reexecutar o job e registrar o link do run. Para imagem, atualizar base e
   dependências; para Semgrep, ajustar código ou regra específica; para ZAP,
   confirmar o alerta manualmente antes de permitir uma exceção de regra.

**Triagem inicial do Gitleaks (2026-10-02).** A varredura dos 38 commits locais
apontou sete achados `generic-api-key`. Quatro são as chaves públicas oficiais
de teste do reCAPTCHA em `.env.example`, `env.ts` e `test-env.ts`; dois são
senhas fictícias de testes e um é uma entrada da lista de senhas proibidas.
Cada linha histórica foi conferida com o valor de teste conhecido. Os sete
fingerprints exatos estão em `.gitleaksignore`; achados futuros continuam
bloqueantes. Não houve achado de credencial operacional nessa varredura.

## Ativação do DAST

Tecnologia/SI definem o staging e a variável de repositório `STAGING_URL`
apontando somente para esse ambiente. O job fica suspenso enquanto a variável
estiver vazia. Antes de ativá-lo, confirmar escopo e autorização em
`docs/security/pentest-scope.md` e impedir que o scanner alcance produção.

## Estado da evidência

Lint, tipos, testes unitários, API E2E (incluindo EICAR real), navegador em
Chromium e `pnpm audit` passaram localmente em 2026-10-02. No GitHub,
Gitleaks, Trivy para as imagens API/web e seus SBOMs passaram no run
`37052634396`. O CodeQL completou a análise, mas não pôde publicar resultados:
o GitHub respondeu que *code scanning* não está habilitado neste repositório
privado. O gate foi substituído por Semgrep CE com falha em achados; sua primeira
execução e o job completo de E2E ainda precisam ser confirmados. DAST aguarda
staging.
