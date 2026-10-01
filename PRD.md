# PRD — Envio e Gestão de Receitas | Drogaria Venancio

**Versão:** 1.2  
**Data:** 01/10/2026  
**Status:** Draft para validação de Produto, Tecnologia, Operações, Segurança e Jurídico/DPO  
**Nome de trabalho:** Receita Venancio

---

## 0. Governança da documentação

Este documento (`PRD.md`) é a fonte de verdade para **requisitos de produto, regras de negócio, escopo, fluxos funcionais, segurança, arquitetura, dados, integrações e critérios de aceite**.

Todas as decisões relacionadas a **Design System, UI, UX visual, layout, tipografia, cores, espaçamento, componentes, estados visuais, responsividade, microcopy de interface, wireframes e telas de referência** devem ser tratadas exclusivamente no arquivo **`/DESIGN.md`**, na raiz do projeto.

Regras de governança:

- o `PRD.md` define **o que o produto deve fazer**;
- o `DESIGN.md` define **como a experiência deve ser apresentada e se comportar visualmente**;
- em caso de conflito sobre regra de negócio ou comportamento funcional, prevalece o `PRD.md`;
- em caso de conflito sobre apresentação, layout, componentes, textos de interface, acessibilidade visual ou responsividade, prevalece o `DESIGN.md`;
- o logotipo e demais variações oficiais de marca utilizados pela aplicação devem ser carregados a partir de **`/img/logo/`**, na raiz do projeto;
- telas e screenshots usados apenas como referência de design devem ser armazenados em **`/docs/design/references/`** e não devem ser tratados como assets de produção.

---

## 1. Resumo executivo

A Drogaria Venancio precisa disponibilizar uma aplicação web, responsiva e mobile first, para que clientes possam enviar receitas médicas digitalmente para uma loja específica da rede. O fluxo público deverá contemplar identificação da loja, upload de um ou mais arquivos, CPF opcional, validação anti-bot via Google reCAPTCHA e confirmação de envio. Todas as decisões visuais e de experiência de interface desse fluxo são especificadas no `DESIGN.md`.

Além do link público de cada loja, o sistema permitirá que um colaborador autorizado gere, no Admin, um **link personalizado e seguro para um paciente específico e uma loja específica**. Ao acessar esse link, o cliente já estará previamente identificado no contexto do envio e não precisará informar CPF. O vínculo entre paciente, loja e receita será estabelecido no backend a partir do token seguro do link. O link poderá ser copiado e enviado ao cliente por WhatsApp, e-mail ou outro canal de comunicação.

No ambiente interno, colaboradores da loja deverão visualizar as receitas recebidas em tempo real, identificar o paciente quando possível e, quando o CPF não tiver sido informado ou não houver correspondência automática, vincular manualmente a receita a um paciente por meio de busca por CPF, telefone ou e-mail. Nos envios realizados por link personalizado válido, o paciente já chegará vinculado à receita.

O produto terá três perfis internos: **Colaborador da Loja**, **Gestor/Supervisor** e **Administrador**. Cada loja verá apenas suas próprias receitas; gestores poderão visualizar o conjunto de lojas sob sua responsabilidade; administradores terão visão global.

A primeira versão **não fará OCR nem validação clínica/regulatória da receita**, mas a arquitetura deverá permitir que, no futuro, um modelo de OCR/IA extraia informações da prescrição e execute validações adicionais.

---

## 2. Contexto e problema

Hoje, o envio de receitas para uma loja pode depender de canais não estruturados, como mensagens, atendimento manual ou troca de arquivos por meios que dificultam rastreabilidade, associação ao paciente, segurança da informação e gestão operacional.

O novo produto deverá resolver quatro problemas principais:

1. **Simplificar o envio da receita pelo cliente**, especialmente pelo celular.
2. **Garantir que a receita seja direcionada para a loja correta**, principalmente quando o cliente já estiver fisicamente na loja.
3. **Dar visibilidade operacional à equipe da loja**, com atualização em tempo real e notificações de novos recebimentos.
4. **Permitir a associação da receita ao paciente**, de forma automática quando o CPF estiver disponível e de forma manual quando necessário.

---

## 3. Objetivos do produto

### 3.1 Objetivos de negócio

- Digitalizar e padronizar o recebimento de receitas nas lojas.
- Reduzir dependência de canais informais para recebimento de documentos.
- Melhorar rastreabilidade das receitas recebidas.
- Facilitar a associação entre receita, paciente e loja.
- Criar uma base tecnológica preparada para OCR e validações futuras.
- Permitir visão gerencial do volume e andamento das receitas por loja.

### 3.2 Objetivos de experiência

- Permitir que o cliente conclua o envio em poucos passos.
- Priorizar uso em smartphones.
- Não exigir cadastro ou login do cliente.
- Evitar campos desnecessários.
- Informar claramente quando o envio foi concluído.
- Permitir fotografia direta da receita no celular.

### 3.3 Objetivos técnicos

- Suportar links específicos por loja.
- Suportar links personalizados, seguros e revogáveis, previamente vinculados a paciente e loja.
- Manter arquivos em armazenamento privado e seguro.
- Implementar controle de acesso por perfil e por loja.
- Implementar trilha de auditoria de visualização, download, vínculo e mudança de status.
- Atualizar o painel da loja em tempo real.
- Preparar interfaces de integração para API de pacientes e, futuramente, OCR/IA.

---

## 4. Não objetivos do MVP

O MVP não deverá:

- interpretar clinicamente a receita;
- validar autenticidade da prescrição;
- validar assinatura digital, QR Code, CRM, data de validade ou tipo de receituário;
- identificar automaticamente medicamentos por OCR;
- recomendar medicamentos;
- verificar interações medicamentosas;
- criar carrinho, orçamento ou pedido;
- integrar com PDV ou e-commerce;
- acompanhar o pedido pelo lado do cliente;
- permitir chat entre cliente e loja;
- gerar protocolo público de acompanhamento.

Essas capacidades poderão ser avaliadas em fases posteriores.

---

## 5. Personas

### 5.1 Cliente

Pessoa que precisa enviar uma receita médica para uma loja Venancio.

**Necessidades:**

- enviar a receita rapidamente pelo celular;
- fotografar ou anexar arquivos existentes;
- evitar cadastro/login;
- saber que o documento foi recebido.

### 5.2 Colaborador da Loja

Profissional que recebe e trata receitas destinadas à sua unidade.

**Necessidades:**

- visualizar rapidamente novas receitas;
- ser avisado sobre novos recebimentos;
- identificar o paciente;
- consultar dados básicos do envio;
- visualizar ou baixar os arquivos;
- alterar o status operacional da receita.

### 5.3 Gestor/Supervisor

Responsável por acompanhar várias lojas.

**Necessidades:**

- visualizar receitas das lojas sob sua responsabilidade;
- acompanhar volume, filas e status;
- identificar gargalos ou receitas pendentes de vínculo.

### 5.4 Administrador

Responsável pela configuração global do sistema.

**Necessidades:**

- cadastrar/importar lojas;
- gerenciar usuários e perfis;
- associar usuários a lojas ou grupos de lojas;
- acessar dashboard global;
- configurar parâmetros do sistema;
- consultar logs e auditoria.

---

## 6. Canais de entrada

A mesma aplicação web responsiva poderá ser acessada por:

- site da Drogaria Venancio;
- aplicativo da Venancio;
- WhatsApp;
- QR Code exposto na loja;
- link público da loja enviado por um colaborador;
- link personalizado para um paciente específico, gerado no Admin;
- outros canais digitais futuros.

### 6.1 Regra de identificação da loja

Cada loja terá um identificador único no sistema, baseado em sua numeração oficial.

O administrador poderá importar a base de lojas. O sistema gerará um link público único por loja.

**Exemplo conceitual:**

`https://receita.venancio.com.br/l/{identificador-da-loja}`

Recomenda-se que o identificador público seja um token ou slug não sequencial, internamente associado ao número da loja.

### 6.2 Entrada com loja previamente identificada

Quando o cliente acessar por link específico, QR Code, WhatsApp da loja ou link enviado por colaborador:

- a loja deverá ser identificada automaticamente;
- o cliente não deverá precisar selecionar a loja;
- o nome/número da loja poderá ser exibido discretamente para confirmação.

### 6.3 Entrada genérica

Quando o cliente acessar a aplicação sem contexto de loja, por exemplo por um link genérico no site ou app:

- o sistema deverá solicitar a seleção de uma loja antes do envio;
- a lista poderá permitir busca por número, nome, bairro ou endereço quando esses dados estiverem disponíveis na base;
- a loja escolhida deverá ser persistida no envio.

> **Premissa do PRD:** o fluxo genérico com seleção de loja será usado quando o link não possuir identificação prévia da unidade.

### 6.4 Link personalizado por paciente e loja

Usuários internos autorizados poderão gerar um link específico para um **paciente já conhecido** e para uma **loja definida**.

Fluxo conceitual:

1. colaborador acessa a ação **Gerar link para paciente** no Admin;
2. seleciona a loja de destino, respeitando seu escopo de acesso;
3. pesquisa o paciente na API por CPF, telefone ou e-mail;
4. seleciona o paciente correto;
5. sistema gera um token seguro e cria o link personalizado;
6. sistema exibe a URL para cópia;
7. colaborador envia a URL por WhatsApp, e-mail ou outro canal;
8. cliente acessa o link e visualiza diretamente a tela de upload;
9. cliente não precisa informar CPF;
10. após o envio, a receita é criada já vinculada ao paciente e à loja definidos na geração do link.

**Exemplo conceitual:**

`https://receita.venancio.com.br/p/{token-seguro}`

O token deve ser **opaco, imprevisível e não sequencial**. A URL não deverá conter CPF, nome, e-mail, telefone, ID interno do paciente ou qualquer outro dado pessoal legível.

### 6.5 Regras de segurança do link personalizado

O link personalizado deve ser tratado como uma credencial de acesso temporária ao fluxo de envio. Para o MVP:

- o token deve possuir alta entropia criptográfica;
- apenas o hash do token deve ser persistido no banco, sempre que tecnicamente viável;
- o link deve possuir data de expiração configurável;
- o link deve poder ser revogado manualmente por usuário autorizado;
- recomenda-se comportamento de **uso único**, tornando o link inválido após um envio concluído com sucesso;
- falhas de upload não devem consumir o link;
- links expirados, revogados ou já utilizados devem exibir uma mensagem neutra sem revelar dados do paciente;
- o backend deve validar token, validade, status, loja e paciente antes de aceitar o upload;
- o reCAPTCHA continua obrigatório antes do botão **Enviar**, inclusive no fluxo por link personalizado;
- páginas de link personalizado devem utilizar `Cache-Control: no-store` e `Referrer-Policy: no-referrer`;
- nenhum identificador sensível do paciente deve ser enviado para ferramentas de analytics.

O prazo padrão de expiração deverá ser definido na configuração do produto. Como referência inicial, recomenda-se **7 dias**, sujeito à validação operacional e de Segurança da Informação.

### 6.6 Experiência do cliente no link personalizado

Quando o token for válido:

- a loja será definida automaticamente;
- o paciente será definido no backend automaticamente;
- o campo CPF não será apresentado;
- o cliente não deverá precisar fazer login ou cadastro;
- a tela deverá manter a mesma experiência simples de upload;
- poderá ser exibida uma mensagem neutra como **“Envie sua receita para a Drogaria Venancio”**, evitando expor nome completo, CPF ou outros dados pessoais na página;
- após o envio, será exibida apenas a confirmação de sucesso, sem protocolo.

---

## 7. Jornada principal do cliente

### 7.1 Fluxo resumido

**Fluxo público/genérico:**

1. Cliente acessa o link.
2. Sistema identifica a loja automaticamente ou solicita seleção.
3. Cliente visualiza a tela de envio.
4. Cliente pode informar o CPF, opcionalmente.
5. Cliente fotografa ou seleciona até 10 arquivos.
6. Sistema valida formato, quantidade e tamanho.
7. Cliente conclui o reCAPTCHA.
8. O botão **Enviar** é habilitado.
9. Cliente envia a receita.
10. Sistema cria o registro e armazena os arquivos.
11. Loja recebe atualização em tempo real.
12. Cliente visualiza confirmação simples de sucesso.

**Fluxo por link personalizado:**

1. Cliente acessa o link personalizado recebido por WhatsApp, e-mail ou outro canal.
2. Backend valida o token e resolve paciente + loja.
3. Cliente visualiza diretamente a tela de upload, sem campo CPF.
4. Cliente fotografa ou seleciona até 10 arquivos.
5. Sistema valida formato, quantidade e tamanho.
6. Cliente conclui o reCAPTCHA.
7. O botão **Enviar** é habilitado.
8. Cliente envia a receita.
9. Sistema cria a receita já vinculada ao paciente e à loja do link.
10. Quando configurado como uso único, o token é marcado como utilizado.
11. Loja recebe atualização em tempo real.
12. Cliente visualiza confirmação simples de sucesso.

### 7.2 Especificação de interface

A especificação visual e de interação da jornada pública, incluindo layout, comportamento responsivo, componentes, estados, textos de interface, wireframes, referências e padrões de upload, está definida exclusivamente no **`DESIGN.md`**.

Este PRD não deve duplicar regras de Design System. Alterações futuras de UI/UX que não modifiquem regras de negócio deverão ser feitas no `DESIGN.md`.

### 7.3 Confirmação de envio

Após o envio bem-sucedido:

- exibir um estado de confirmação de sucesso conforme especificado no `DESIGN.md`;
- não gerar protocolo para o cliente;
- não exibir acompanhamento de status;
- permitir encerrar o fluxo ou retornar ao site/app, caso haja contexto para isso.

---

## 8. Regras do CPF e vínculo com paciente

### 8.1 CPF no envio público

- O CPF será **opcional**.
- Quando preenchido, deverá ser validado estruturalmente no frontend e no backend.
- O CPF deverá ser armazenado de forma protegida e utilizado para tentativa de identificação do paciente.

### 8.2 Identificação automática

Quando a API de pacientes estiver disponível:

1. o backend consulta a API utilizando o CPF informado;
2. se existir correspondência inequívoca, a receita é automaticamente vinculada ao paciente;
3. o status de identificação passa para **Paciente identificado**;
4. os dados retornados pela API deverão ser minimizados ao estritamente necessário para a operação.

### 8.3 CPF não informado

Quando o cliente não informar CPF:

- a receita será criada normalmente;
- o campo de vínculo ficará vazio;
- a receita deverá ser destacada como **Paciente não identificado**;
- o colaborador poderá fazer a identificação manual.

### 8.4 CPF informado sem correspondência

Se o CPF for informado, mas a API não localizar um paciente:

- a receita permanece válida;
- deve ficar como **Paciente não identificado**;
- o colaborador poderá pesquisar manualmente.

### 8.5 Busca manual

O colaborador poderá pesquisar pacientes pelos seguintes campos:

- CPF;
- telefone;
- e-mail.

A busca será realizada por API cuja especificação será definida futuramente.

### 8.6 Vínculo manual

O colaborador deverá:

1. abrir a receita;
2. clicar em **Vincular paciente**;
3. pesquisar CPF, telefone ou e-mail;
4. selecionar um resultado;
5. confirmar o vínculo.

Após confirmação:

- o vínculo deverá ser persistido;
- o evento deverá ser auditado;
- deverá ser registrado usuário, data/hora, receita e paciente vinculado.

No MVP, a ação interna sobre o paciente termina no vínculo. Não haverá edição de cadastro do paciente.

### 8.7 Vínculo por link personalizado

Quando a receita for enviada por um link personalizado válido:

- o sistema não deverá solicitar CPF ao cliente;
- o `patient_external_id` definido na criação do link deverá ser utilizado no envio;
- a receita deverá nascer com status de identificação **Identificado por link personalizado**;
- a loja deverá ser a loja previamente vinculada ao link;
- o frontend não poderá sobrescrever paciente ou loja;
- qualquer tentativa de manipular esses dados na requisição deverá ser ignorada/rejeitada pelo backend;
- o evento deverá ser registrado na auditoria como vínculo originado por link personalizado.

---

## 9. Upload de arquivos

### 9.1 Formatos permitidos

- JPG
- JPEG
- PNG
- HEIC/HEIF
- PDF

### 9.2 Limites

- máximo de **10 arquivos por envio**;
- máximo de **5 MB por arquivo**;
- o sistema deverá informar de forma clara quando um arquivo exceder o limite;
- arquivos inválidos não deverão ser enviados ao backend.

### 9.3 Captura pelo celular

Em dispositivos compatíveis, o campo de upload deverá permitir:

- selecionar imagens da galeria;
- selecionar arquivos existentes;
- abrir a câmera para fotografar a receita.

### 9.4 Segurança de arquivos

O backend deverá:

- validar MIME type real e extensão;
- renomear arquivos com identificadores internos;
- impedir execução de conteúdo ativo;
- rejeitar formatos fora da allowlist;
- armazenar arquivos em bucket/contêiner privado;
- não gerar URL pública permanente;
- usar URL temporária assinada para visualização/download;
- registrar download em auditoria;
- suportar varredura antimalware, preferencialmente assíncrona.

### 9.5 Pré-visualização

Antes do envio, o cliente deverá poder:

- visualizar miniaturas de imagens;
- visualizar nome e tamanho de PDFs;
- remover um arquivo;
- adicionar novos arquivos até atingir o limite.

---

## 10. Google reCAPTCHA e proteção contra abuso

### 10.1 Comportamento obrigatório

O reCAPTCHA deverá ser concluído antes que o botão **Enviar** seja habilitado.

O envio só poderá ocorrer quando:

- houver ao menos um arquivo válido;
- a loja estiver definida;
- o CPF, quando aplicável e informado, for válido;
- o link personalizado, quando utilizado, estiver válido, ativo e não expirado;
- o reCAPTCHA estiver válido.

### 10.2 Validação server-side

A validação do reCAPTCHA no frontend não será suficiente. O backend deverá validar o token junto ao serviço do Google antes de aceitar o envio.

### 10.3 Controles complementares

Além do reCAPTCHA, recomenda-se:

- rate limiting por IP/origem;
- limitação de tentativas por janela de tempo;
- bloqueio temporário de padrões abusivos;
- WAF/CDN na borda;
- logs de segurança;
- limite global de payload por requisição;
- invalidação de token reCAPTCHA já utilizado quando aplicável.

### 10.4 Implementação sugerida

Para atender ao requisito explícito de “concluir o reCAPTCHA antes de habilitar o botão”, utilizar **Google reCAPTCHA com desafio/checkbox visível ou alternativa equivalente do reCAPTCHA Enterprise**, com validação no servidor.

---

## 11. Estados da receita

### 11.1 Status operacional

Fluxo principal:

`Recebida → Em análise → Em atendimento → Finalizada`

Estados alternativos:

- **Cancelada**
- **Não atendida**

> A identificação do paciente é um eixo separado do status operacional. Uma receita pode, por exemplo, estar **Em análise** e simultaneamente **Não identificada**.

### 11.2 Status de identificação

O status de identificação deverá ser tratado separadamente do status operacional para evitar ambiguidade.

Valores:

- **Não identificado**
- **Identificado automaticamente por CPF**
- **Identificado manualmente**
- **Identificado por link personalizado**

### 11.3 Estado inicial

Após um envio válido:

- status operacional: **Recebida**;
- identificação: conforme resultado do CPF/API.

### 11.4 Regras de transição

- Colaborador da Loja poderá alterar status de receitas de sua loja.
- Gestor/Supervisor poderá alterar status das lojas sob sua responsabilidade.
- Administrador poderá alterar qualquer receita.
- Toda alteração deverá ser registrada na auditoria.
- O sistema não deverá exigir que o paciente esteja identificado para visualizar a receita.

---

## 12. Painel administrativo

### 12.1 Objetivo

Fornecer uma fila operacional simples, atualizada em tempo real, para tratamento das receitas recebidas.

### 12.2 Tela inicial / Fila de receitas

Exibir, no mínimo:

- data/hora de recebimento;
- loja;
- status operacional;
- status de identificação;
- CPF parcialmente mascarado, quando informado;
- quantidade de anexos;
- indicador de nova/não visualizada;
- ação para abrir detalhes.

### 12.3 Filtros

Filtros recomendados:

- período;
- loja, conforme permissão;
- status operacional;
- identificação;
- com/sem CPF;
- novas/não visualizadas;
- paciente vinculado/não vinculado;
- origem do envio: link público/genérico ou link personalizado.

### 12.4 Ordenação

Ordenação padrão:

- receitas mais recentes primeiro.

Permitir, no mínimo:

- mais recentes;
- mais antigas.

### 12.5 Atualização em tempo real

Quando uma nova receita chegar:

- inserir o item na fila sem refresh da página;
- atualizar os contadores do dashboard;
- exibir notificação visual;
- reproduzir alerta sonoro quando permitido pelo navegador e habilitado pelo usuário.

A aplicação deverá considerar restrições modernas de autoplay. O alerta sonoro poderá exigir uma primeira interação do colaborador com o sistema para ser ativado.

### 12.6 Marcação de nova receita

Uma receita será considerada “nova” até a primeira abertura por um usuário autorizado.

O evento de primeira visualização deverá ser registrado.

---

## 13. Detalhe da receita no admin

A tela deverá exibir:

- loja destinatária;
- data/hora do envio;
- CPF informado, com mascaramento adequado e opção de visualização conforme permissão;
- status operacional;
- status de identificação;
- paciente vinculado, se houver;
- lista de anexos;
- visualização dos anexos;
- botão de download;
- ação **Vincular paciente** quando necessário;
- histórico básico de alterações.

### 13.1 Visualização de arquivos

- Imagens deverão ser exibidas em viewer com zoom.
- PDF deverá ser exibido em viewer compatível com navegador.
- Quando o navegador não permitir preview, oferecer download.

### 13.2 Download

O download será permitido para usuários internos autorizados.

Cada download deverá gerar registro de auditoria contendo:

- usuário;
- perfil;
- receita;
- arquivo;
- data/hora;
- contexto da loja.

---

## 14. Perfis e permissões

### 14.1 Colaborador da Loja

Pode:

- visualizar dashboard da própria loja;
- visualizar receitas da própria loja;
- abrir anexos;
- baixar anexos;
- alterar status;
- buscar paciente;
- vincular paciente;
- gerar e revogar links personalizados para pacientes da própria loja.

Não pode:

- visualizar outras lojas;
- cadastrar lojas;
- administrar usuários globais;
- alterar configurações globais.

### 14.2 Gestor/Supervisor

Pode:

- visualizar as lojas sob sua responsabilidade;
- visualizar dashboards consolidados dessas lojas;
- executar as mesmas ações operacionais do colaborador nas lojas autorizadas;
- gerar e revogar links personalizados para pacientes nas lojas sob sua responsabilidade.

Não pode:

- administrar lojas fora de seu escopo;
- alterar configurações globais, salvo permissões específicas futuras.

### 14.3 Administrador

Pode:

- visualizar todas as lojas;
- visualizar todas as receitas;
- importar e administrar lojas;
- administrar usuários;
- associar usuários e gestores às lojas;
- consultar auditoria;
- configurar parâmetros do sistema;
- acessar dashboards globais;
- gerar e revogar links personalizados para qualquer loja ativa.

---

## 15. Autenticação interna

### 15.1 Login

O sistema terá autenticação própria com:

- e-mail ou identificador de usuário;
- senha.

### 15.2 Segurança de senha

Requisitos mínimos:

- hash forte de senha, preferencialmente Argon2id;
- política de senha configurável;
- proteção contra brute force;
- bloqueio progressivo ou temporário após tentativas inválidas;
- recuperação de senha por fluxo seguro;
- invalidação de sessões após redefinição de senha.

### 15.3 Google Authenticator / TOTP

O administrador poderá habilitar autenticação em dois fatores por usuário ou por política.

O segundo fator deverá ser compatível com aplicativos TOTP, incluindo Google Authenticator.

Fluxo de ativação:

1. usuário autenticado acessa configurações de segurança;
2. sistema gera segredo TOTP e QR Code;
3. usuário cadastra no autenticador;
4. confirma um código de 6 dígitos;
5. sistema marca 2FA como ativo.

Recomenda-se fornecer códigos de recuperação de uso único.

### 15.4 Sessão

Recomenda-se:

- cookies HttpOnly, Secure e SameSite;
- expiração de sessão configurável;
- renovação segura;
- logout explícito;
- possibilidade de revogação de sessões pelo administrador.

---

## 16. Administração de lojas

### 16.1 Importação

O Administrador deverá importar uma base de lojas por CSV.

### 16.2 Campos mínimos sugeridos

| Campo | Obrigatório | Descrição |
|---|---:|---|
| `store_number` | Sim | Número oficial da loja |
| `store_name` | Sim | Nome de exibição |
| `active` | Sim | Loja ativa/inativa |
| `address` | Não | Endereço |
| `neighborhood` | Não | Bairro |
| `city` | Não | Cidade |
| `state` | Não | UF |

### 16.3 Validações da importação

- `store_number` deve ser único;
- linhas inválidas deverão ser apresentadas em relatório;
- importação não deve duplicar lojas existentes;
- quando o número já existir, o sistema poderá atualizar os demais campos;
- lojas inativas não deverão aceitar novos envios;
- a importação deverá gerar log de auditoria.

### 16.4 Link público da loja

Ao cadastrar uma nova loja, o sistema deverá:

- gerar identificador público;
- gerar URL específica;
- permitir copiar o link;
- permitir geração/download de QR Code em fase posterior ou já no MVP caso o esforço seja baixo.

---

## 17. Links personalizados para pacientes

### 17.1 Objetivo

Permitir que um usuário interno gere uma URL segura já vinculada a um paciente e a uma loja, reduzindo fricção no envio da receita e eliminando a necessidade de o cliente informar CPF.

### 17.2 Permissões

- **Colaborador da Loja:** pode gerar links apenas para sua própria loja.
- **Gestor/Supervisor:** pode gerar links para as lojas sob sua responsabilidade.
- **Administrador:** pode gerar links para qualquer loja ativa.

### 17.3 Fluxo no Admin

A tela/ação deverá permitir:

1. escolher a loja dentro do escopo do usuário;
2. pesquisar paciente por CPF, telefone ou e-mail;
3. visualizar resultados mínimos suficientes para desambiguar o paciente;
4. selecionar o paciente;
5. definir validade do link quando permitido pela configuração;
6. clicar em **Gerar link**;
7. copiar a URL gerada;
8. enviar a URL ao cliente pelo canal desejado.

No MVP, a aplicação precisa obrigatoriamente **gerar e permitir copiar o link**. O disparo nativo por WhatsApp/e-mail poderá ser integrado posteriormente sem alterar o modelo do link.

### 17.4 Gestão dos links

O Admin deverá permitir visualizar, conforme permissão:

- paciente associado, com dados mascarados quando aplicável;
- loja;
- usuário que gerou;
- data/hora de criação;
- expiração;
- status do link: **Ativo, Utilizado, Expirado ou Revogado**;
- data/hora de utilização, quando houver;
- ação de revogar link ativo.

Para reduzir exposição, recomenda-se não manter o token em texto puro após a geração. Caso o link precise ser reenviado e o token não seja recuperável com segurança, o usuário deverá revogar o link anterior e gerar um novo.

### 17.5 Auditoria

Devem ser auditados:

- geração do link;
- paciente e loja associados;
- usuário gerador;
- revogação;
- abertura do link, quando tecnicamente apropriado e conforme política de privacidade;
- consumo do link após envio bem-sucedido.

---

## 18. Dashboard

### 18.1 Objetivo

Permitir acompanhamento operacional e gerencial do volume de receitas.

### 18.2 Indicadores principais

Exibir, no mínimo:

- receitas recebidas hoje;
- receitas recebidas no período selecionado;
- receitas por status;
- receitas não visualizadas;
- receitas sem paciente identificado;
- receitas identificadas automaticamente;
- receitas identificadas manualmente;
- receitas identificadas por link personalizado;
- envios originados por link personalizado;
- links personalizados ativos/utilizados/expirados, quando o usuário tiver permissão;
- receitas finalizadas;
- receitas canceladas;
- receitas não atendidas;
- volume por loja.

### 18.3 Indicadores de tempo

Mesmo sem SLA formal, recomenda-se medir:

- tempo até primeira visualização;
- tempo entre recebimento e identificação do paciente;
- tempo entre recebimento e finalização.

Esses indicadores serão informativos e não representarão SLA no MVP.

### 18.4 Filtros do dashboard

- hoje;
- últimos 7 dias;
- últimos 30 dias;
- intervalo customizado;
- loja;
- conjunto de lojas do gestor.

### 18.5 Apresentação do dashboard

A forma de apresentação dos indicadores, incluindo componentes, gráficos, tabelas, hierarquia visual, responsividade e estados de interação, deverá seguir exclusivamente o **`DESIGN.md`**.

---

## 19. Notificações

### 19.1 Visual

Ao receber nova receita, a aplicação deverá apresentar uma notificação visual perceptível e atualizar o estado da fila sem refresh manual. O padrão de componente, destaque, badge, toast ou equivalente é definido no `DESIGN.md`.

### 19.2 Sonora

- o alerta sonoro deve poder ser habilitado/desabilitado por usuário;
- deve respeitar restrições do navegador;
- não deve repetir indefinidamente o mesmo evento.

A característica sonora e o comportamento de feedback da interface são definidos no `DESIGN.md`.

### 19.3 Tempo real

Implementação sugerida:

- WebSocket ou Server-Sent Events (SSE);
- fallback para polling periódico somente se necessário.

---

## 20. Requisitos funcionais

### RF-001 — Acesso público
O cliente deve conseguir acessar a aplicação sem autenticação.

### RF-002 — Identificação da loja
O sistema deve identificar automaticamente a loja quando o link possuir um identificador válido.

### RF-003 — Seleção de loja
Quando o link não identificar uma loja, o sistema deve solicitar a seleção de uma unidade ativa.

### RF-004 — CPF opcional
O cliente pode enviar a receita sem informar CPF.

### RF-005 — Validação de CPF
Quando informado, o CPF deve ser validado antes do envio.

### RF-006 — Upload múltiplo
O cliente pode enviar até 10 arquivos no mesmo envio.

### RF-007 — Limite por arquivo
Cada arquivo deve possuir no máximo 5 MB.

### RF-008 — Formatos permitidos
O sistema deve aceitar JPG, JPEG, PNG, HEIC/HEIF e PDF.

### RF-009 — Câmera
Em dispositivo compatível, deve ser possível fotografar a receita no momento do envio.

### RF-010 — Pré-visualização
O cliente deve visualizar arquivos selecionados e removê-los antes do envio.

### RF-011 — reCAPTCHA
O cliente deve concluir o reCAPTCHA antes de o botão Enviar ser habilitado.

### RF-012 — Validação server-side do CAPTCHA
O backend deve recusar requisições sem token reCAPTCHA válido.

### RF-013 — Confirmação
Após sucesso, o sistema deve exibir apenas a confirmação de envio, sem protocolo público.

### RF-014 — Recebimento no admin
A receita enviada deve ficar disponível no painel da loja correspondente.

### RF-015 — Atualização em tempo real
Novas receitas devem aparecer sem refresh manual.

### RF-016 — Notificação visual
O painel deve alertar visualmente sobre novas receitas.

### RF-017 — Notificação sonora
O painel deve poder reproduzir som para nova receita.

### RF-018 — Visualização
Usuários autorizados devem visualizar anexos.

### RF-019 — Download
Usuários autorizados devem baixar anexos.

### RF-020 — Identificação automática
Quando a API estiver disponível e o CPF localizar um paciente, a receita deve ser vinculada automaticamente.

### RF-021 — Identificação manual
Usuários internos devem poder buscar pacientes por CPF, telefone ou e-mail.

### RF-022 — Vínculo manual
Usuários internos devem poder vincular uma receita a um paciente retornado pela API.

### RF-023 — Status
Usuários autorizados devem alterar o status operacional da receita.

### RF-024 — RBAC
O sistema deve restringir dados e ações conforme perfil e escopo de loja.

### RF-025 — Gestão de lojas
O Administrador deve importar e gerenciar lojas.

### RF-026 — Gestão de usuários
O Administrador deve criar, editar, ativar e desativar usuários.

### RF-027 — Associação usuário-loja
O Administrador deve definir quais lojas cada usuário/gestor pode acessar.

### RF-028 — Dashboard
O sistema deve disponibilizar dashboard conforme escopo do usuário.

### RF-029 — 2FA
O sistema deve permitir habilitar TOTP compatível com Google Authenticator.

### RF-030 — Auditoria
Ações relevantes devem ser registradas em trilha de auditoria.

### RF-031 — Geração de link personalizado
Usuários autorizados devem poder gerar um link seguro previamente vinculado a um paciente e a uma loja.

### RF-032 — Resolução do link personalizado
Ao acessar um link válido, o backend deve resolver paciente e loja sem expor identificadores pessoais na URL.

### RF-033 — Envio sem CPF via link personalizado
No fluxo de link personalizado, o campo CPF não deve ser exibido e a receita deve ser criada já vinculada ao paciente.

### RF-034 — Expiração e revogação de link
Links personalizados devem possuir expiração e poder ser revogados por usuário autorizado.

### RF-035 — Uso único do link
Por padrão no MVP, o link personalizado deve ser marcado como utilizado após um envio concluído com sucesso e não poderá ser reutilizado, salvo mudança explícita de configuração futura.

### RF-036 — Retenção
O sistema deve suportar política configurável de retenção dos arquivos, inicialmente com mínimo de 365 dias.

---

## 21. Requisitos não funcionais

### RNF-001 — Mobile first
O fluxo público deve ser projetado prioritariamente para smartphones.

### RNF-002 — Responsividade
A aplicação deve funcionar adequadamente em desktop, tablet e mobile.

### RNF-003 — Browsers
Suportar versões atuais dos principais navegadores corporativos e mobile: Chrome, Edge, Safari e Firefox.

### RNF-004 — Performance pública
Em condições normais de rede, o conteúdo inicial da tela pública deve carregar rapidamente, sem depender do carregamento dos arquivos do usuário.

### RNF-005 — Upload resiliente
O cliente deve receber feedback de progresso e erro durante o envio.

### RNF-006 — Segurança em trânsito
Toda comunicação deve usar HTTPS/TLS.

### RNF-007 — Criptografia em repouso
Banco e armazenamento de arquivos devem utilizar criptografia em repouso.

### RNF-008 — Menor privilégio
Acesso a dados deve seguir o princípio de menor privilégio.

### RNF-009 — Observabilidade
A solução deve produzir logs estruturados, métricas e rastreamento de erros.

### RNF-010 — Disponibilidade
A arquitetura deve evitar pontos únicos de falha quando hospedada em produção.

### RNF-011 — Escalabilidade
O armazenamento de arquivos e backend devem escalar independentemente do frontend.

### RNF-012 — Idempotência
O backend deve reduzir risco de criação de envios duplicados por repetição da mesma requisição.

### RNF-013 — Acessibilidade
O fluxo público deve seguir boas práticas WCAG, incluindo contraste, labels, foco visível e uso por teclado.

### RNF-014 — Sanitização
Inputs devem ser sanitizados e validados no backend.

### RNF-015 — Auditoria imutável
Eventos de auditoria não devem ser editáveis por usuários comuns.

---

## 22. Privacidade, LGPD e segurança

Receitas médicas podem conter **dados pessoais sensíveis relacionados à saúde**. Por isso, o produto deverá ser tratado como sistema de alta sensibilidade de dados.

### 22.1 Requisitos mínimos

- controle de acesso por perfil e loja;
- autenticação forte para ambiente interno;
- 2FA opcional no MVP e passível de obrigatoriedade futura;
- criptografia em trânsito e repouso;
- arquivos em storage privado;
- URLs temporárias assinadas;
- mascaramento de CPF em listagens;
- auditoria de visualização e download;
- logs de segurança;
- política de retenção;
- exclusão segura ao término da retenção, quando a política definitiva for aprovada;
- acesso administrativo restrito;
- backups protegidos;
- gestão de incidentes de segurança.

### 22.2 Aviso de privacidade

Conforme decisão de produto, **não haverá checkbox de consentimento antes do envio**.

A interface pública deverá, entretanto, disponibilizar de forma visível um link para a Política/Aviso de Privacidade da Venancio e explicar de forma objetiva que os dados enviados serão utilizados para viabilizar o atendimento relacionado à receita.

> **Ponto obrigatório de validação antes de produção:** Jurídico/DPO deverá confirmar a base legal aplicável, texto do aviso de privacidade, prazo definitivo de retenção e política de descarte. O produto não deve presumir que “envio voluntário” equivale, por si só, à definição da base legal correta.

### 22.3 Retenção

Requisito atual:

- manter os dados por **no mínimo 1 ano**.

Proposta para o MVP:

- parâmetro global de retenção;
- valor inicial de 365 dias;
- impedir configuração abaixo de 365 dias até nova decisão;
- política final sujeita a validação do Jurídico/DPO.

---

## 23. Auditoria

Registrar, no mínimo:

- login bem-sucedido e falho;
- ativação/desativação de 2FA;
- abertura da receita;
- primeira visualização;
- visualização de arquivo;
- download de arquivo;
- alteração de status;
- vínculo de paciente;
- desvinculação/correção de vínculo, caso a função seja habilitada;
- importação de lojas;
- criação/edição/inativação de usuário;
- alteração de escopo de acesso;
- alteração de configurações;
- geração de link personalizado;
- revogação de link personalizado;
- consumo/utilização de link personalizado.

Campos mínimos do evento:

- ID do evento;
- data/hora;
- usuário;
- perfil;
- ação;
- entidade;
- entidade ID;
- loja relacionada;
- resultado;
- IP/origem quando necessário para segurança e conforme política de privacidade.

---

## 24. Arquitetura técnica sugerida

### 24.1 Visão de alto nível

```text
Cliente Web/Mobile
      |
      v
CDN / WAF
      |
      v
Frontend Público + Admin (Next.js / TypeScript)
      |
      v
API Backend (NestJS / TypeScript)
      |
      +--------------------+
      |                    |
      v                    v
PostgreSQL           Object Storage Privado
      |              (S3 / Blob / GCS)
      |
      +----> Integração futura API de Pacientes
      |
      +----> Serviço futuro OCR/IA
      |
      +----> Canal Real-time (WebSocket/SSE)
```

### 24.2 Frontend

Sugestão:

- React;
- Next.js;
- TypeScript;
- implementação compatível com os requisitos de responsividade definidos neste PRD e detalhados no `DESIGN.md`;
- mesma base tecnológica para área pública e admin, com módulos/rotas separados.

### 24.3 Backend

Sugestão:

- Node.js;
- NestJS;
- TypeScript;
- API REST;
- WebSocket ou SSE para eventos em tempo real.

### 24.4 Banco de dados

Sugestão:

- PostgreSQL.

Principais dados estruturados:

- lojas;
- usuários;
- permissões;
- receitas;
- anexos;
- vínculo de paciente;
- status;
- auditoria;
- configurações.

### 24.5 Armazenamento de arquivos

Utilizar serviço de object storage:

- AWS S3;
- Azure Blob Storage;
- Google Cloud Storage;
- ou solução S3-compatible equivalente.

Requisitos:

- bucket privado;
- criptografia;
- lifecycle configurável;
- URLs assinadas com curta duração;
- sem acesso anônimo.

### 24.6 Cache e tempo real

Redis poderá ser utilizado para:

- pub/sub de eventos;
- rate limiting;
- sessões, se necessário;
- fila de tarefas assíncronas;
- futuras tarefas de OCR.

Não é obrigatório na primeira entrega se o volume inicial permitir solução mais simples.

### 24.7 Processamento assíncrono

Preparar arquitetura para workers assíncronos, especialmente para:

- antivírus;
- conversão/normalização de HEIC;
- geração de thumbnails;
- OCR futuro;
- validações futuras.

---

## 25. Modelo de dados conceitual

### 25.1 Store

- `id`
- `store_number`
- `store_name`
- `public_slug`
- `active`
- `address`
- `neighborhood`
- `city`
- `state`
- `created_at`
- `updated_at`

### 25.2 User

- `id`
- `name`
- `email`
- `password_hash`
- `role`
- `active`
- `totp_enabled`
- `totp_secret_encrypted`
- `created_at`
- `updated_at`

### 25.3 UserStoreAccess

- `user_id`
- `store_id`
- `created_at`

### 25.4 PatientUploadLink

- `id`
- `store_id`
- `patient_external_id`
- `token_hash`
- `status` (`active` / `used` / `expired` / `revoked`)
- `created_by_user_id`
- `expires_at`
- `used_at`
- `revoked_at`
- `revoked_by_user_id`
- `created_at`

### 25.5 PrescriptionSubmission

- `id`
- `store_id`
- `cpf_encrypted`
- `cpf_hash_for_lookup`
- `operational_status`
- `identification_status`
- `patient_external_id`
- `source_channel` (`generic` / `store_link` / `personalized_link` / outros futuros)
- `patient_upload_link_id` (nullable)
- `first_viewed_at`
- `created_at`
- `updated_at`
- `retention_until`

### 25.6 PrescriptionFile

- `id`
- `submission_id`
- `storage_key`
- `original_filename`
- `mime_type`
- `size_bytes`
- `checksum`
- `malware_scan_status`
- `created_at`

### 25.7 StatusHistory

- `id`
- `submission_id`
- `from_status`
- `to_status`
- `changed_by_user_id`
- `created_at`

### 25.8 PatientLinkHistory

- `id`
- `submission_id`
- `patient_external_id`
- `link_type` (`automatic_cpf` / `manual` / `personalized_link`)
- `linked_by_user_id`
- `created_at`

### 25.9 AuditLog

- `id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `store_id`
- `metadata`
- `ip_address`
- `created_at`

---

## 26. APIs conceituais

### 26.1 Público

```text
GET    /public/stores/{slug}
GET    /public/stores?search=
GET    /public/patient-links/{token}
POST   /public/prescriptions
POST   /public/patient-links/{token}/prescriptions
```

### 26.2 Autenticação

```text
POST   /auth/login
POST   /auth/logout
POST   /auth/forgot-password
POST   /auth/reset-password
POST   /auth/totp/setup
POST   /auth/totp/confirm
POST   /auth/totp/verify
```

### 26.3 Receitas

```text
GET    /prescriptions
GET    /prescriptions/{id}
PATCH  /prescriptions/{id}/status
POST   /prescriptions/{id}/patient-link
GET    /prescriptions/{id}/files/{fileId}/view-url
GET    /prescriptions/{id}/files/{fileId}/download-url
```

### 26.4 Pacientes — integração futura

```text
GET /patients/search?cpf=
GET /patients/search?phone=
GET /patients/search?email=
```

A definição real dependerá da API a ser informada posteriormente.

### 26.5 Lojas

```text
GET    /admin/stores
POST   /admin/stores/import
PATCH  /admin/stores/{id}
GET    /admin/stores/{id}/public-link
```

### 26.6 Links personalizados

```text
GET    /admin/patient-links
POST   /admin/patient-links
POST   /admin/patient-links/{id}/revoke
```

A criação deverá receber apenas referências internas/autorizadas de `store_id`, `patient_external_id` e parâmetros de validade. O token secreto será gerado exclusivamente no backend.

### 26.7 Usuários

```text
GET    /admin/users
POST   /admin/users
PATCH  /admin/users/{id}
PUT    /admin/users/{id}/stores
```

### 26.8 Dashboard

```text
GET /dashboard/summary
GET /dashboard/timeseries
GET /dashboard/by-status
GET /dashboard/by-store
```

---

## 27. Integração futura com API de pacientes

Criar uma camada de abstração, por exemplo `PatientProvider`, para evitar que regras de negócio fiquem acopladas ao contrato de uma API específica.

Interface conceitual:

```ts
interface PatientProvider {
  findByCpf(cpf: string): Promise<Patient | null>;
  searchByCpf(cpf: string): Promise<Patient[]>;
  searchByPhone(phone: string): Promise<Patient[]>;
  searchByEmail(email: string): Promise<Patient[]>;
}
```

Dessa forma, a API poderá ser conectada futuramente sem mudanças relevantes no frontend ou no domínio de receitas.

---

## 28. Preparação para OCR futuro

Embora OCR esteja fora do MVP, o modelo deverá permitir uma etapa futura de processamento.

Campos futuros sugeridos:

- `ocr_status`;
- `ocr_provider`;
- `ocr_raw_output`;
- `ocr_confidence`;
- `prescription_type`;
- `prescriber_name`;
- `prescriber_crm`;
- `prescription_date`;
- `detected_medications`;
- `validation_flags`.

Fluxo futuro:

`Upload → Antivírus → OCR → Extração → Validações → Revisão Humana`

Nenhuma dessas validações deverá bloquear o MVP.

---

## 29. Eventos de analytics

### Público

- `prescription_page_viewed`
- `store_auto_identified`
- `store_selected`
- `cpf_entered`
- `file_added`
- `file_removed`
- `file_validation_failed`
- `recaptcha_completed`
- `prescription_submit_started`
- `prescription_submit_succeeded`
- `prescription_submit_failed`
- `personalized_link_opened`
- `personalized_link_invalid`
- `personalized_link_upload_succeeded`

### Admin

- `admin_login_succeeded`
- `prescription_opened`
- `prescription_file_viewed`
- `prescription_file_downloaded`
- `patient_search_performed`
- `patient_linked`
- `prescription_status_changed`
- `store_import_completed`
- `personalized_link_created`
- `personalized_link_revoked`

> Analytics não deverá receber conteúdo da receita, CPF integral ou dados clínicos.

---

## 30. Métricas de sucesso

### Produto

- quantidade de receitas enviadas;
- taxa de sucesso de upload;
- taxa de abandono antes do envio;
- percentual de receitas com CPF informado;
- percentual identificado automaticamente;
- percentual identificado manualmente;
- percentual não identificado;
- percentual de envios originados por link personalizado;
- taxa de sucesso dos links personalizados;
- quantidade média de arquivos por envio.

### Operação

- receitas recebidas por loja;
- receitas recebidas por período;
- tempo até primeira visualização;
- tempo até identificação;
- tempo até finalização;
- receitas por status.

### Tecnologia

- taxa de erro no envio;
- latência das APIs;
- erros de storage;
- falhas de reCAPTCHA;
- falhas de integração com API de pacientes;
- eventos de segurança/bloqueio.

---

## 31. Wireframes, telas de referência e especificação visual

Wireframes, exemplos de tela, referências visuais, microcopy, componentes e demais decisões de UI/UX foram migrados para o **`DESIGN.md`**, que é a fonte de verdade visual da aplicação.

Os screenshots de referência devem ser mantidos em **`/docs/design/references/`**. O logotipo oficial utilizado pela aplicação deve ser obtido em **`/img/logo/`**.

---

## 32. Critérios de aceite principais

### CA-001 — Envio sem CPF

**Dado** que o cliente acessou uma loja válida  
**E** selecionou ao menos um arquivo válido  
**E** concluiu o reCAPTCHA  
**Quando** clicar em Enviar  
**Então** a receita deverá ser criada mesmo sem CPF  
**E** deverá aparecer como Paciente não identificado.

### CA-002 — Envio com CPF válido

**Dado** que o cliente informou um CPF válido  
**Quando** enviar a receita  
**Então** o CPF deverá ser persistido de forma protegida  
**E**, quando a integração estiver ativa, deverá ser consultado na API de pacientes.

### CA-003 — Botão Enviar

**Dado** que o reCAPTCHA não foi concluído  
**Então** o botão Enviar deverá permanecer desabilitado.

### CA-004 — Arquivo acima de 5 MB

**Dado** um arquivo com tamanho superior a 5 MB  
**Quando** o cliente tentar adicioná-lo  
**Então** o sistema deverá rejeitá-lo  
**E** informar o motivo.

### CA-005 — Mais de 10 arquivos

**Dado** que já existem 10 arquivos selecionados  
**Quando** o cliente tentar adicionar outro  
**Então** o sistema deverá impedir a inclusão  
**E** informar o limite.

### CA-006 — Nova receita em tempo real

**Dado** um colaborador autenticado no painel da loja  
**Quando** uma nova receita for recebida para essa loja  
**Então** a receita deverá aparecer sem refresh manual  
**E** deverá ocorrer notificação visual  
**E**, quando habilitado, alerta sonoro.

### CA-007 — Isolamento por loja

**Dado** um Colaborador da Loja A  
**Quando** acessar a lista de receitas  
**Então** não deverá conseguir visualizar dados da Loja B.

### CA-008 — Vínculo manual

**Dado** uma receita não identificada  
**Quando** um colaborador pesquisar um paciente por CPF, telefone ou e-mail  
**E** confirmar um resultado  
**Então** o paciente deverá ser vinculado à receita  
**E** o evento deverá ser auditado.

### CA-009 — Download auditado

**Quando** um usuário autorizado baixar um arquivo  
**Então** o sistema deverá registrar o evento de download na auditoria.

### CA-010 — Loja inativa

**Dado** um link associado a uma loja inativa  
**Quando** o cliente acessá-lo  
**Então** o sistema não deverá permitir novo envio  
**E** deverá apresentar mensagem adequada.

### CA-011 — Geração de link personalizado

**Dado** um usuário autorizado  
**E** uma loja dentro de seu escopo  
**E** um paciente selecionado a partir da API  
**Quando** clicar em Gerar link  
**Então** o sistema deverá criar uma URL com token opaco  
**E** vincular internamente o token à loja e ao paciente  
**E** permitir copiar a URL.

### CA-012 — Acesso por link personalizado válido

**Dado** um link personalizado ativo e não expirado  
**Quando** o cliente acessá-lo  
**Então** o sistema deverá carregar a tela de envio  
**E** não deverá solicitar CPF  
**E** deverá manter paciente e loja definidos exclusivamente pelo backend.

### CA-013 — Envio por link personalizado

**Dado** um link personalizado válido  
**E** ao menos um arquivo válido  
**E** reCAPTCHA concluído  
**Quando** o cliente enviar a receita  
**Então** a receita deverá ser criada já vinculada ao paciente e à loja do link  
**E** a identificação deverá ser marcada como Identificado por link personalizado  
**E** o link deverá ser marcado como utilizado quando configurado como uso único.

### CA-014 — Link inválido, expirado ou revogado

**Dado** um token inexistente, expirado, revogado ou já utilizado  
**Quando** o cliente acessar a URL  
**Então** o sistema deverá bloquear o envio  
**E** exibir mensagem neutra  
**E** não revelar se existe ou existiu determinado paciente.

---

## 33. Tratamento de erros

### Público

O sistema deverá tratar, no mínimo, os seguintes cenários:

- falha geral de envio;
- arquivo acima de 5 MB;
- quantidade superior a 10 arquivos;
- formato de arquivo não permitido;
- CPF inválido;
- reCAPTCHA não concluído ou inválido;
- loja indisponível para novos envios;
- link personalizado inválido, expirado, revogado ou já utilizado.

A redação, apresentação visual, hierarquia e componentes usados nas mensagens de erro são definidos no `DESIGN.md`.

### Admin

- falha de API de paciente não deve impedir visualização da receita;
- falha de integração deve informar indisponibilidade temporária;
- ação de vínculo não deve ser confirmada até retorno positivo do backend;
- erros devem possuir correlation/request ID em logs técnicos.

A apresentação desses estados na interface é definida no `DESIGN.md`.

---

## 34. Observabilidade

Implementar:

- logs estruturados;
- correlation ID por requisição;
- métricas de latência e erro;
- métricas de upload;
- métricas de integração;
- health checks;
- alertas técnicos;
- rastreamento distribuído via OpenTelemetry, quando compatível com o ambiente.

### Dashboards técnicos sugeridos

- volume de requisições;
- taxa de erro HTTP;
- latência p50/p95/p99;
- uploads por minuto;
- falhas de storage;
- falhas de reCAPTCHA;
- falhas da API de pacientes;
- conexões de WebSocket/SSE;
- filas assíncronas futuras.

---

## 35. Segurança de aplicação

Requisitos recomendados:

- OWASP ASVS como referência;
- proteção CSRF quando aplicável;
- CSP;
- HSTS;
- rate limiting;
- headers de segurança;
- validação de upload;
- antivírus;
- proteção contra IDOR;
- autorização no backend em todas as rotas;
- secrets fora do código-fonte;
- rotação de credenciais;
- segregação de ambientes;
- logs sem conteúdo de receita;
- pentest antes de produção.

---

## 36. Ambientes

Recomenda-se:

- Development;
- Homologação/Staging;
- Produção.

Receitas reais e dados reais de pacientes não devem ser utilizados em ambientes não produtivos sem processo aprovado de anonimização/mascaramento.

---

## 37. Estratégia de entrega

### Fase 1 — Fundação

- autenticação interna;
- perfis e permissões;
- cadastro/importação de lojas;
- geração de links por loja;
- geração segura de links personalizados por paciente + loja;
- expiração e revogação de links personalizados;
- estrutura de storage;
- auditoria base.

### Fase 2 — Envio público

- fluxo público conforme regras funcionais deste PRD e especificação visual do `DESIGN.md`;
- CPF opcional;
- upload múltiplo;
- câmera;
- validações;
- reCAPTCHA;
- confirmação de envio;
- fluxo de upload via link personalizado sem CPF.

### Fase 3 — Operação da loja

- fila de receitas;
- detalhe;
- preview/download;
- status;
- notificações visual/sonora;
- tempo real.

### Fase 4 — Pacientes e dashboard

- adapter da API de pacientes;
- busca por CPF/telefone/e-mail;
- vínculo manual;
- vínculo automático por CPF;
- dashboard operacional/gerencial.

### Fase 5 — Evoluções futuras

- OCR;
- classificação de receita;
- extração de medicamentos;
- validações regulatórias;
- integrações com venda/PDV/e-commerce;
- geração automática de dados estruturados;
- priorização inteligente de filas.

---

## 38. Backlog pós-MVP sugerido

- OCR da receita;
- leitura de nome do paciente;
- leitura do prescritor/CRM;
- classificação por tipo de receita;
- validação de data;
- validação de assinatura/QR Code quando aplicável;
- reconhecimento de medicamentos;
- integração com estoque;
- orçamento automático;
- carrinho/pedido;
- acompanhamento pelo cliente;
- notificações via WhatsApp;
- QR Code exportável por loja;
- painel de qualidade de OCR;
- detecção de receita duplicada;
- antifraude avançado.

---

## 39. Dependências

- definição do domínio/URL pública;
- `DESIGN.md` validado e assets oficiais de marca disponíveis em `/img/logo/`;
- telas de referência organizadas em `/docs/design/references/`;
- base oficial de lojas e numeração;
- definição futura da API de pacientes;
- credenciais Google reCAPTCHA;
- infraestrutura de object storage;
- definição de serviço de e-mail para recuperação de senha;
- validação de Segurança da Informação;
- validação de Jurídico/DPO para LGPD, retenção e aviso de privacidade.

---

## 40. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Upload de arquivos maliciosos | Alto | Allowlist, MIME validation, antivírus, storage privado |
| Exposição de dados sensíveis | Alto | RBAC, criptografia, URLs assinadas, auditoria |
| Receita enviada para loja errada | Médio/Alto | Link específico por loja e confirmação visual |
| Link personalizado encaminhado a terceiro | Alto | Token opaco, expiração, uso único, revogação, sem PII na URL e logs de auditoria |
| Bots/scripts automatizados | Médio | reCAPTCHA server-side, rate limit, WAF |
| CPF incorreto | Médio | Validação estrutural e possibilidade de vínculo manual |
| API de pacientes indisponível | Médio | Fallback para receita não identificada e retry controlado |
| Vazamento via logs | Alto | Proibir conteúdo clínico e CPF integral nos logs |
| Notificação sonora bloqueada | Baixo | Feedback visual + ativação de som após interação |
| Retenção inadequada | Alto | Configuração central + validação Jurídico/DPO |
| Crescimento do volume de arquivos | Médio | Object storage escalável + lifecycle |

---

## 41. Decisões já tomadas

- Aplicação web responsiva e mobile first.
- Acesso por site, app, WhatsApp, QR Code e link direto.
- Link em loja identifica automaticamente a unidade.
- Admin pode gerar link personalizado vinculado previamente a paciente e loja.
- Link personalizado pode ser copiado e enviado por WhatsApp, e-mail ou outro canal.
- Cliente que acessa link personalizado não informa CPF; paciente e loja são resolvidos no backend.
- Link personalizado deve ser opaco, expirável e revogável; uso único é a recomendação padrão do MVP.
- Base de lojas será importada no admin.
- CPF é o único dado solicitado ao cliente e será opcional.
- Sem CPF ou sem match, colaborador faz vínculo manual.
- Busca de paciente por CPF, telefone ou e-mail.
- Dados de paciente virão de API a ser definida posteriormente.
- Máximo de 10 arquivos por envio.
- Máximo de 5 MB por arquivo.
- Formatos JPG/JPEG/PNG/HEIC/PDF.
- Permitir câmera do celular.
- Todos os tipos de receita podem ser enviados.
- OCR e validações ficam para o futuro.
- Confirmação simples de envio, sem protocolo.
- Fluxo operacional: Recebida → Em análise → Em atendimento → Finalizada, com Cancelada e Não atendida; identificação do paciente é um status separado.
- No MVP, ação sobre paciente termina no vínculo.
- Perfis: Colaborador da Loja, Gestor/Supervisor e Administrador.
- Colaborador vê apenas sua loja; gestor vê lojas sob sua gestão; administrador vê todas.
- Login próprio da aplicação.
- Suporte opcional a Google Authenticator/TOTP.
- Notificação visual e sonora no admin.
- Atualização em tempo real.
- Sem SLA operacional formal.
- Retenção mínima de 1 ano, sujeita a validação definitiva.
- Visualização e download de receita permitidos no admin.
- Dashboard incluído.
- Sem integração com venda no MVP.
- Sem checkbox de aceite; reCAPTCHA obrigatório antes de habilitar Enviar.
- Arquitetura técnica incluída neste PRD.
- Todas as decisões de Design System, UI/UX visual, wireframes e microcopy de interface são mantidas exclusivamente no `DESIGN.md`.
- Logotipos oficiais da aplicação são consumidos de `/img/logo/`.
- Screenshots de referência ficam em `/docs/design/references/`.

---

## 42. Pontos em aberto para as próximas etapas

1. Nome oficial do produto.
2. Domínio/URL final.
3. Arquivo e campos definitivos da base de lojas.
4. API de pacientes e contrato técnico.
5. Serviço de hospedagem/cloud definitivo.
6. Serviço de e-mail para recuperação de senha.
7. Definição se 2FA será opcional ou obrigatório por perfil.
8. Política definitiva de retenção após validação do Jurídico/DPO.
9. Texto final do aviso de privacidade.
10. Validação final do `DESIGN.md` e disponibilização dos assets oficiais em `/img/logo/`.
11. Necessidade de gerar QR Code por loja já no MVP.
12. Estratégia de antivírus para uploads.
13. Confirmar prazo padrão de expiração do link personalizado (referência inicial: 7 dias).
14. Confirmar se o comportamento de uso único será obrigatório ou configurável por tipo de link.
15. Definir se haverá integração nativa de disparo por WhatsApp/e-mail no MVP ou apenas geração/cópia do link.

---

## 43. Definition of Done do MVP

O MVP poderá ser considerado pronto quando:

- lojas puderem ser importadas e receber link próprio;
- usuário autorizado puder gerar, copiar, expirar/revogar link personalizado para paciente + loja;
- cliente puder enviar receita por link personalizado sem informar CPF e a receita chegar já vinculada ao paciente correto;
- cliente conseguir enviar receita pelo celular sem login;
- CPF for opcional;
- upload múltiplo respeitar formatos, limite de 10 arquivos e 5 MB por arquivo;
- câmera do celular funcionar em dispositivos compatíveis;
- reCAPTCHA for obrigatório e validado no backend;
- cliente receber confirmação de sucesso;
- receita aparecer em tempo real na loja correta;
- colaborador visualizar e baixar arquivos;
- colaborador alterar status;
- colaborador vincular paciente manualmente;
- integração automática por CPF estiver pronta para conexão com API real ou implementada quando o endpoint estiver disponível;
- dashboard estiver disponível por escopo de acesso;
- RBAC impedir acesso entre lojas não autorizadas;
- 2FA TOTP puder ser habilitado;
- auditoria registrar eventos críticos;
- arquivos estiverem em storage privado;
- observabilidade mínima estiver implementada;
- implementação visual estiver aderente ao `DESIGN.md`;
- o projeto utilizar os assets oficiais de marca a partir de `/img/logo/`;
- requisitos de Segurança e LGPD forem aprovados internamente para produção.

---

## 44. Conclusão

O produto deve priorizar uma experiência de envio extremamente simples para o cliente e uma operação segura, rastreável e eficiente para as lojas. A principal decisão arquitetural é tratar a receita como um documento sensível desde sua entrada, mantendo separação clara entre o arquivo recebido, a identificação do paciente e o fluxo operacional.

A solução proposta permite lançar um MVP sem OCR ou integrações comerciais, mas já deixa os principais pontos de extensão preparados para API de pacientes, links personalizados de atendimento, automações, OCR, validações regulatórias e integração futura com a jornada omnichannel da Venancio. A apresentação e a evolução visual da solução deverão permanecer desacopladas deste PRD e centralizadas no `DESIGN.md`.
