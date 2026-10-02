# Checklist de integração — API de pacientes

O contrato da API real ainda não foi definido (PRD §27, §42.4). Este checklist
reúne o que precisa ser respondido/entregue antes de implementar o
`HttpPatientProvider` (`apps/api/src/modules/patients/http-patient.provider.ts`)
e ligar `PATIENT_INTEGRATION_ENABLED=true` com `PATIENT_PROVIDER=http`.

## 1. Especificação

- [ ] Especificação formal (OpenAPI, coleção Postman ou documento) salva em
      `docs/integrations/patients-api.*`.
- [ ] Ambiente de homologação com **dados fictícios** e credenciais próprias.
- [ ] Versão da API e política de mudanças/depreciação.

## 2. Operações necessárias (mapeamento do contrato `PatientProvider`)

| Operação do domínio    | Pergunta para a API                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `searchByCpf(cpf)`     | Existe busca exata por CPF? Pode retornar mais de um paciente?                             |
| `findByCpf(cpf)`       | Há endpoint de correspondência única? (senão usamos `searchByCpf` e exigimos exatamente 1) |
| `searchByPhone(phone)` | Formato esperado (com/sem DDI, máscara)? Busca exata?                                      |
| `searchByEmail(email)` | Case-insensitive? Busca exata (não "contém")?                                              |

- [ ] Buscas são **exatas** (sem busca parcial ou por prefixo — reduz enumeração).
- [ ] A API permite limitar a quantidade de resultados.
- [ ] Os termos de busca vão no **corpo** ou em cabeçalho, nunca na URL (CPF, telefone
      e e-mail não podem aparecer em logs de proxy). Se a API exigir query string,
      registrar o risco e a mitigação com Segurança.

## 3. Dados retornados (minimização — PRD §8.2)

- [ ] Identificador estável do paciente (`patient_external_id`): formato e tamanho
      (coluna atual: até 128 caracteres).
- [ ] Campos usados: nome, CPF, telefone, e-mail — apenas para gerar o resumo
      mascarado. **Todo o restante é descartado no adapter**.
- [ ] Confirmar se é possível pedir só esses campos (projeção/`fields`).
- [ ] Pacientes inativos/falecidos/mesclados: como são sinalizados? Devem ser excluídos?

## 4. Autenticação e transporte

- [ ] Mecanismo (OAuth2 client credentials, mTLS, API key). Credenciais apenas por
      variável de ambiente/secret manager (`PATIENT_API_TOKEN`), rotação definida.
- [ ] TLS 1.2+; certificado válido; IPs de saída precisam de allowlist?
- [ ] Rede: a API é acessível da infraestrutura própria (D-001)?

## 5. Erros, limites e desempenho

- [ ] Códigos de erro: "não encontrado" (404 ou lista vazia?), entrada inválida
      (400/422), indisponibilidade (5xx), limite (429 + `Retry-After`).
- [ ] Rate limit da API e cota por cliente (alinhar com nossos limites por usuário).
- [ ] Latência p95/p99 esperada (timeout atual: 2 s por tentativa, 2 novas tentativas).
- [ ] Janela de manutenção e SLA.

## 6. LGPD e segurança

- [ ] Base legal e registro da operação de tratamento com o DPO.
- [ ] A API registra quem consultou? (nossa auditoria registra usuário, contexto,
      tipo de critério e HMAC do termo — nunca o valor).
- [ ] Contrato/termo de uso entre as áreas responsáveis.

## 7. Implementação (quando o contrato existir)

- [ ] Implementar `HttpPatientProvider` com `fetch` + `AbortSignal.timeout`, mapeando
      cada registro com `toPatientSummary` e falhas em `PatientProviderError`.
- [ ] Rodar a suíte de contrato (`test/contracts/patient-provider.contract.ts`) contra
      um servidor fake baseado na especificação e contra a homologação.
- [ ] Remover o bloqueio de `PATIENT_PROVIDER=http` em `apps/api/src/config/env.ts`.
- [ ] Ajustar timeouts/limites conforme o item 5 e validar os alertas de
      `patient_provider_errors_total` e `patient_provider_circuit_state`.
