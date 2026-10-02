# Retenção e descarte de receitas — operação proposta

**Estado:** implementação técnica disponível em dry-run; execução real **bloqueada** até decisão formal do Jurídico/DPO sobre prazo, base legal, suspensão, auditoria e backups (PRD §22.2, §22.3 e §42.8). Este texto é material operacional, não parecer jurídico.

## Fluxo

`retention_until` é calculado no envio com a configuração `retention_days`, cujo mínimo de 365 dias permanece validado no banco e na API. O comando abaixo lista até 100 receitas vencidas, sem modificar dados:

```bash
pnpm --filter @receita/api retention
pnpm --filter @receita/api retention --limit=1000
```

Para executar, Operações deve anexar o registro de aprovação de Jurídico/DPO à mudança, revisar o relatório, verificar a configuração do storage e agendar o comando isolado (não no boot da API). A habilitação exige **simultaneamente** `RETENTION_EXECUTION_ENABLED=true`, `RETENTION_APPROVAL_REFERENCE=<identificador do registro>` e `RETENTION_STORAGE_VERSIONING=disabled`. O valor inicial é `false`/vazio/`unknown`; sem os três, o comando recusa `--apply`.

```bash
pnpm --filter @receita/api retention --apply --limit=100
pnpm --filter @receita/api retention --apply --retry --limit=100
```

Na imagem de produção, execute `node dist/retention.js` com os mesmos argumentos;
o runtime não contém pnpm.

O CLI imprime apenas IDs, contagem e sucesso/falha. Não imprime CPF, nome, token, URL ou conteúdo. O processo reivindica cada receita com atualização condicional e bloqueia novas aberturas. Apaga original, JPEG/miniaturas e objeto de quarentena, depois remove registros dos arquivos e histórico de vínculos, limpa CPF criptografado e hash, identificador/rótulo do paciente e chave de idempotência, revoga e minimiza o link personalizado, e marca `disposed_at`. O evento `prescription.disposed` registra IDs e quantidade sem conteúdo pessoal. Falhas ficam marcadas, são auditadas como `prescription.disposal_failed` e só são retomadas com `--retry` após dez minutos. A exclusão de objeto S3 é idempotente para permitir retomada.

O Administrador pode ativar/desativar retenção suspensa por receita na rota `PATCH /admin/retention/:id/legal-hold`, com `{ "enabled": true|false }`; cada mudança é auditada. Uma receita suspensa não aparece no relatório e não pode ser reivindicada pelo job. Ao iniciar o descarte, a suspensão já não pode ser alterada para evitar estado parcial. A ação requer `settings:manage` no escopo global.

## Verificações de storage e backup antes de habilitar

O adapter S3 atual usa exclusão simples por chave. Em um bucket com versionamento ativo, isso pode criar apenas um _delete marker_, deixando versões antigas recuperáveis. Por isso a execução é bloqueada enquanto `RETENTION_STORAGE_VERSIONING` não for explicitamente `disabled`. Antes de marcar `disabled`, Operações deve verificar no **bucket real** que não há versões antigas desses objetos. Se houver, a política de exclusão definitiva de versões deve ser implementada e testada no provedor escolhido antes da execução.

Também é necessário registrar a política de lifecycle para objetos órfãos e quarentena, o período de retenção e destruição de snapshots/replicações/backups de banco e storage, e um teste de restauração que comprove quando um objeto descartado deixa de ser recuperável. Um `disposed_at` no banco representa a exclusão na camada ativa; não comprova eliminação de cópias em backup. O prazo máximo de recuperação em backups deve constar do aviso de privacidade aprovado. Sem essas evidências, o go-live de descarte permanece bloqueado.

## Retenção separada de auditoria e logs

**Proposta para Jurídico/DPO e Segurança:** manter `audit_logs` íntegros pelo prazo aprovado para investigação/prestação de contas e logs técnicos por prazo menor, com acesso restrito. Definir por escrito os prazos, o evento inicial, a suspensão por incidente e a eliminação ao final. A tabela de auditoria é append-only por trigger e não é apagada pelo job de receitas. Registros históricos podem conter identificadores externos de paciente em metadados; isso exige análise e plano de minimização/expurgo próprio antes de afirmar eliminação integral de dados pessoais. Logs técnicos devem permanecer sem CPF, contatos, tokens, URLs assinadas ou nomes de arquivo. Não use o job de receitas como substituto da política de auditoria/backups.

## Aprovações pendentes

| Tema                                    | Responsável              | Evidência antes de habilitar                           |
| --------------------------------------- | ------------------------ | ------------------------------------------------------ |
| Prazo definitivo, base legal e aviso    | Jurídico/DPO             | Decisão registrada e aviso publicado                   |
| Legal hold e retenção de auditoria/logs | Jurídico/DPO + Segurança | Política aprovada e procedimento de levantamento       |
| Versionamento, lifecycle e cópias       | Operações + Segurança    | Configuração do bucket e teste de exclusão/restauração |
| Agenda, alarmes e revisão de falhas     | Operações                | Job, monitoramento e runbook revisados                 |
