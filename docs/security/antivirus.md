# Antivírus de anexos — operação e evidência

**Estado:** adapter ClamAV implementado; validação end-to-end com daemon real pendente nesta estação (Docker/clamd indisponíveis). O go-live exige executar o teste real em CI ou staging com assinaturas atualizadas e registrar o resultado.

## Arquitetura

- `MalwareScanner` é a interface de integração. O worker usa `ClamAvScanner` por padrão; outro serviço gerenciado pode implementar `scan` e `ping` sem alterar a regra de acesso.
- O ClamAV roda em container próprio (`docker-compose.yml`), com FreshClam e banco de assinaturas persistido em `clamav-data`. O protocolo TCP não autentica nem cifra: a porta é publicada somente em `127.0.0.1` no desenvolvimento; em staging/produção, use rede privada entre worker/API e scanner, sem exposição pública. [Documentação oficial do ClamAV](https://github.com/Cisco-Talos/clamav/blob/main/README.Docker.md).
- A API só emite URL assinada para status `CLEAN`. `PENDING`, `NOT_SCANNED`, `FAILED` e `INFECTED` ficam bloqueados. Em erro do daemon, o worker registra `FAILED`, incrementa `security_events_total{type="malware_scanner_unavailable"}` e mantém o arquivo bloqueado. A readiness inclui `antivirus`.
- Uma detecção marca `INFECTED` antes da cópia, move o conteúdo para `quarantine/{fileId}/original`, exclui o original e derivados, audita `prescription.file_quarantined` e incrementa `security_events_total{type="malware_detected"}`. A quarentena está no bucket privado, com prefixo isolado e sem rota de download. Não há assinatura ou conteúdo nos logs/auditoria. O processamento é retomável se a cópia/exclusão falhar.
- O Admin exibe a situação do arquivo sem assinatura ou diagnóstico. O colaborador recebe apenas mensagem genérica de indisponibilidade.

## Atraso e resposta

O worker conta arquivos `PENDING`, `NOT_SCANNED` ou `FAILED` com mais de `MALWARE_SCAN_WARN_SECONDS` (120 s por padrão) e `MALWARE_SCAN_CRITICAL_SECONDS` (300 s). A métrica `malware_scan_delayed_files{threshold="warning|critical"}` e o log técnico sem dados pessoais são sinais para alertas operacionais. Segurança e Operações devem definir o destino dos alertas e o plantão antes do go-live.

1. Confirme que `GET /health/ready` retorna `antivirus: ok` e que o container está saudável.
2. Verifique FreshClam, espaço em disco, memória e conectividade privada entre worker e daemon.
3. Arquivos não verificados seguem bloqueados. Após restabelecer o scanner, reexecute os jobs falhos e rode `pnpm --filter @receita/api rescan` para relatório.
4. `pnpm --filter @receita/api rescan --apply` processa até 1.000 arquivos legados/falhos/pendentes. `--limit=N` aceita 1–5.000. `--all` inclui arquivos `CLEAN` para nova verificação. `--retry-quarantine` conclui isolamentos interrompidos. Execute uma instância por vez e monitore a métrica de atraso. O comando omite IDs e nomes dos arquivos da saída.

## Teste de aceitação com scanner real

1. Suba `docker compose up -d clamav` e aguarde a saúde do container. Confirme que FreshClam carregou assinaturas.
2. Execute `CLAMAV_REAL_TEST=1 pnpm --filter @receita/api exec vitest run --config vitest.config.e2e.ts test/clamav-real.e2e-spec.ts` com banco e storage **sintéticos** de teste.
3. O teste exige `INFECTED` no EICAR oficial, ausência do objeto original, objeto em quarentena e AuditLog. O teste de protocolo com servidor TCP simulado cobre `PING`, `CLEAN` e `FOUND`; o teste do worker cobre falha do scanner e bloqueio de URL.

EICAR é um arquivo de teste benigno, definido pela [organização EICAR](https://www.eicar.org/download-anti-malware-testfile/). A execução real não foi possível na estação atual porque não há Docker nem `clamd` instalados. Registrar a execução no pipeline/staging antes da homologação de segurança.
