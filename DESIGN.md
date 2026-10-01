# DESIGN — Envio e Gestão de Receitas | Drogaria Venancio

**Versão:** 1.0  
**Data:** 01/10/2026  
**Status:** Draft para validação de Produto, UX/UI e Marca  
**Documento relacionado:** `/PRD.md`

---

## 1. Objetivo e fonte de verdade

Este documento é a fonte de verdade para todas as decisões de **Design System, UI, UX visual, layout, tipografia, cores, espaçamento, componentes, estados visuais, responsividade, microcopy de interface, wireframes e telas de referência** da aplicação de envio e gestão de receitas da Drogaria Venancio.

O `PRD.md` define o comportamento funcional e as regras de negócio. O `DESIGN.md` define como essas capacidades devem ser apresentadas e operadas visualmente.

Regras de governança:

- não duplicar especificações visuais no `PRD.md`;
- mudanças exclusivamente visuais ou de UX devem ser registradas neste arquivo;
- mudanças que alterem regra de negócio, permissão, segurança, dados, integração ou critério de aceite devem ser refletidas também no `PRD.md`;
- em conflito de comportamento funcional, prevalece o `PRD.md`;
- em conflito de apresentação, layout, componentes, microcopy, acessibilidade visual ou responsividade, prevalece este `DESIGN.md`.

---

## 2. Estrutura de arquivos de design

Estrutura recomendada na raiz do projeto:

```text
/
├── PRD.md
├── DESIGN.md
├── img/
│   └── logo/
│       ├── ... assets oficiais da Drogaria Venancio
│       └── ... variações aprovadas de marca
└── docs/
    └── design/
        └── references/
            ├── dasa-upload-desktop.png
            ├── dasa-upload-mobile.png
            └── README.md
```

### 2.1 Logotipo

Todo logotipo utilizado pela aplicação deverá ser obtido a partir de **`/img/logo/`**, na raiz do projeto.

Regras:

- não baixar ou reconstruir logotipos externamente durante o desenvolvimento;
- não utilizar versões improvisadas, capturadas de screenshot ou rasterizadas quando houver asset oficial disponível;
- utilizar a variação correta para fundos claros/escuros, caso mais de uma versão seja disponibilizada;
- proporções do logotipo devem ser preservadas;
- área de respiro e tamanho mínimo devem respeitar o material oficial de marca quando disponível.

### 2.2 Telas de referência

Screenshots e referências externas **não são assets de produção**. Devem ser armazenados em:

`/docs/design/references/`

Para este projeto, as telas de referência iniciais são:

- `dasa-upload-desktop.png` — referência do fluxo público em desktop;
- `dasa-upload-mobile.png` — referência do fluxo público em mobile.

Essas imagens servem para orientar **simplicidade, hierarquia, espaçamento, comportamento responsivo e clareza do fluxo**, não para copiar a identidade visual da Dasa.

A aplicação final deve utilizar a identidade visual da Drogaria Venancio.

---

## 3. Princípios de design

A experiência deve seguir os princípios abaixo:

1. **Simplicidade:** o cliente deve perceber imediatamente o que precisa fazer.
2. **Mobile first:** o fluxo público será usado principalmente em smartphones.
3. **Baixa fricção:** sem cadastro ou login para o cliente.
4. **Foco na ação:** upload da receita é o elemento dominante da tela pública.
5. **Clareza:** limites, formatos, erros e progresso devem ser explícitos.
6. **Confiança:** o produto lida com documentação sensível e deve transmitir segurança e profissionalismo.
7. **Consistência:** área pública e Admin compartilham tokens e componentes-base, respeitando necessidades distintas.
8. **Acessibilidade:** contraste, foco, labels, navegação por teclado e tamanho de alvo devem ser considerados desde o início.
9. **Não imitar a referência:** os screenshots da Dasa são referência de experiência, não de branding.

---

## 4. Design tokens

O projeto deverá trabalhar com tokens semânticos, evitando valores visuais espalhados pelo código.

### 4.1 Cores

Os valores finais devem ser definidos a partir da identidade oficial da Drogaria Venancio. Não utilizar o azul da referência da Dasa como cor padrão.

Tokens mínimos:

```text
color.brand.primary
color.brand.primaryHover
color.brand.primaryActive
color.brand.onPrimary

color.background.page
color.background.surface
color.background.subtle

color.text.primary
color.text.secondary
color.text.muted
color.text.inverse
color.text.link

color.border.default
color.border.strong
color.border.focus

color.status.success
color.status.warning
color.status.error
color.status.info

color.state.disabledBackground
color.state.disabledText
color.state.hover
color.state.selected
```

### 4.2 Tipografia

A família tipográfica final deverá seguir a identidade Venancio ou fonte corporativa aprovada.

Escala semântica mínima:

```text
type.display
type.h1
type.h2
type.h3
type.body
type.bodySmall
type.label
type.caption
type.button
```

Regras:

- evitar excesso de variações de tamanho;
- títulos devem ter hierarquia clara;
- textos de orientação devem ser confortáveis para leitura mobile;
- texto de botão deve permanecer legível em 320 px de largura;
- nunca utilizar tamanho inferior ao adequado para acessibilidade em informações essenciais.

### 4.3 Espaçamento

Adotar escala consistente, preferencialmente baseada em múltiplos de 4 px.

Exemplo de tokens:

```text
space.1
space.2
space.3
space.4
space.6
space.8
space.12
space.16
```

### 4.4 Bordas e radius

Definir tokens centralizados para:

```text
radius.input
radius.button
radius.card
radius.modal
border.default
border.focus
```

A área de upload poderá utilizar borda tracejada, conforme a referência visual, desde que adaptada ao sistema visual Venancio.

### 4.5 Elevação

Sombras devem ser discretas e funcionais. Utilizar apenas quando houver necessidade de separar camadas como dropdowns, modais ou elementos flutuantes.

---

## 5. Responsividade

### 5.1 Mobile

O fluxo público deve ser desenhado primeiro para telas pequenas.

Diretrizes:

- layout em uma coluna;
- margens laterais confortáveis;
- campos e botões em largura total quando apropriado;
- área de upload grande o suficiente para toque;
- não depender de hover;
- câmera e galeria devem ser caminhos naturais de entrada;
- nenhuma informação essencial deve exigir rolagem horizontal.

### 5.2 Desktop

No desktop:

- conteúdo público deve ficar centralizado;
- largura máxima controlada para evitar linhas excessivamente longas;
- manter foco visual no formulário;
- não transformar a tela pública em um dashboard ou layout denso.

### 5.3 Admin

No Admin:

- desktop é o contexto principal;
- tabelas podem usar rolagem horizontal local quando necessário;
- ações principais devem permanecer acessíveis em resoluções menores;
- filtros devem reflowar para múltiplas linhas sem quebrar a hierarquia.

---

## 6. Área pública

### 6.1 Estrutura base

A experiência visual deverá seguir o padrão de simplicidade observado nas referências fornecidas:

- fundo predominantemente claro;
- identidade Venancio no topo;
- conteúdo centralizado no desktop;
- largura controlada no desktop;
- adaptação para largura total no mobile com margens laterais;
- título claro;
- breve orientação;
- área grande de upload com borda tracejada;
- ícone de upload;
- botão primário destacado;
- textos de orientação abaixo da área de upload;
- reCAPTCHA antes do botão final;
- botão **Enviar** desabilitado até que os requisitos funcionais estejam atendidos.

### 6.2 Hierarquia da tela

Ordem recomendada:

1. logotipo Venancio;
2. título;
3. texto de apoio;
4. identificação da loja, quando fizer sentido;
5. CPF opcional, somente nos fluxos em que esse dado é solicitado;
6. área de upload;
7. lista/pré-visualização dos arquivos selecionados;
8. instruções de formato/limite;
9. reCAPTCHA;
10. botão **Enviar**;
11. link para Política/Aviso de Privacidade.

No link personalizado, o CPF não deve ser exibido.

### 6.3 Microcopy base

**Título**

> Envio de receita

**Texto de apoio**

> Fotografe ou anexe sua receita médica. Certifique-se de que a imagem esteja nítida e que todas as informações estejam visíveis.

**CPF**

> CPF do paciente (opcional)

**Upload**

> Escolher arquivos

A experiência mobile também deve permitir **Tirar foto** quando o dispositivo oferecer esse recurso.

**Orientação**

> Você pode enviar até 10 arquivos nos formatos JPG, JPEG, PNG, HEIC ou PDF, com no máximo 5 MB por arquivo.

**Botão final**

> Enviar

### 6.4 Área de upload

O componente de upload deve:

- ter área de clique/toque ampla;
- aceitar drag and drop em desktop quando suportado;
- permitir seleção pela galeria/arquivos;
- permitir abertura da câmera no mobile;
- comunicar quantidade máxima e tamanho máximo;
- exibir progresso de envio;
- exibir estado de erro por arquivo;
- permitir remover arquivos antes do envio;
- mostrar thumbnail para imagens;
- mostrar nome, tamanho e ícone de tipo para PDFs.

Estados mínimos:

- vazio;
- hover/drag-over em desktop;
- arquivo adicionado;
- upload em andamento;
- sucesso;
- erro;
- limite atingido;
- desabilitado.

### 6.5 CPF

Quando exibido:

- label sempre visível;
- máscara adequada;
- validação após interação do usuário;
- erro próximo ao campo;
- não utilizar placeholder como única forma de label.

### 6.6 reCAPTCHA e botão Enviar

O reCAPTCHA deve aparecer imediatamente antes do CTA final.

O botão **Enviar** deve possuir estados:

- desabilitado;
- habilitado;
- loading;
- sucesso indireto pela transição para tela de confirmação;
- erro de envio com possibilidade de tentativa novamente.

O botão não deve mudar de posição ao habilitar/desabilitar.

### 6.7 Confirmação de sucesso

Após envio concluído:

- apresentar estado visual de sucesso;
- usar mensagem principal: **“Receita enviada com sucesso.”**;
- não exibir protocolo;
- não exibir acompanhamento de status;
- evitar informações clínicas ou pessoais na tela de confirmação.

### 6.8 Link personalizado

Quando paciente e loja já estiverem vinculados pelo backend:

- não exibir CPF;
- não exibir dados pessoais completos do paciente;
- manter experiência equivalente ao fluxo público de upload;
- a loja pode ser apresentada apenas como contexto operacional, de forma discreta;
- utilizar texto neutro como **“Envie sua receita para a Drogaria Venancio”** quando houver risco de exposição de informação pessoal.

### 6.9 Link inválido, expirado, revogado ou utilizado

Deve haver uma tela simples de indisponibilidade, sem revelar se o paciente existe ou existiu.

Microcopy recomendada:

> Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.

### 6.10 Loja indisponível

Microcopy recomendada:

> Esta loja não está disponível para novos envios no momento.

---

## 7. Tratamento visual de erros

Mensagens devem ser simples, acionáveis e próximas do contexto do erro.

Microcopy base:

- **Falha geral:** “Não foi possível enviar sua receita. Tente novamente.”
- **Arquivo > 5 MB:** “Este arquivo ultrapassa o limite de 5 MB.”
- **Mais de 10 arquivos:** “Você pode enviar no máximo 10 arquivos.”
- **Formato inválido:** “Formato de arquivo não permitido.”
- **CPF inválido:** “CPF inválido.”
- **reCAPTCHA pendente:** “Conclua a verificação de segurança para continuar.”
- **Loja indisponível:** “Esta loja não está disponível para novos envios.”
- **Link inválido:** “Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.”

Padrões:

- erro inline para campos/arquivos específicos;
- alerta de contexto para falhas gerais;
- não depender apenas de cor;
- incluir ícone + texto quando necessário;
- manter foco acessível no primeiro erro relevante após submit.

---

## 8. Admin

### 8.1 Estrutura geral

O Admin deve privilegiar operação rápida e leitura de fila.

Áreas previstas:

- Login;
- Dashboard;
- Receitas;
- Detalhe da receita;
- Links personalizados;
- Geração de link personalizado;
- Lojas;
- Usuários;
- Configurações;
- Auditoria, quando exposta na interface.

### 8.2 Navegação

Utilizar navegação persistente adequada ao desktop. Em larguras menores, pode ser recolhida, desde que não esconda o contexto atual.

Itens devem respeitar permissões do usuário; telas não autorizadas não devem aparecer na navegação.

### 8.3 Fila de receitas

Informações mínimas a representar visualmente:

- data/hora;
- loja;
- paciente/identificação;
- status operacional;
- status de identificação;
- quantidade de anexos;
- estado nova/não visualizada;
- ação para abrir.

Padrões:

- status como badge/chip com texto explícito;
- linha nova deve ser perceptível sem depender só de cor;
- filtros devem permanecer próximos à tabela;
- ação primária da linha deve ser clara;
- CPF, quando exibido, deve aparecer mascarado de acordo com o PRD.

### 8.4 Detalhe da receita

Organizar em blocos:

1. metadados da receita;
2. paciente/vínculo;
3. status operacional;
4. arquivos;
5. histórico.

O viewer de imagens deve suportar zoom. PDF deve abrir em viewer compatível com navegador; quando indisponível, apresentar ação de download.

### 8.5 Vínculo de paciente

A ação **Vincular paciente** deve abrir um fluxo de busca simples por:

- CPF;
- telefone;
- e-mail.

Resultados devem exibir apenas o necessário para desambiguar pacientes. A confirmação do vínculo deve ser explícita.

### 8.6 Geração de link personalizado

Fluxo visual:

1. selecionar loja dentro do escopo;
2. buscar paciente;
3. selecionar paciente;
4. definir validade, se configurável;
5. gerar link;
6. copiar link.

Depois de gerado, o link deve ter uma ação clara de **Copiar link**. Não apresentar o token como elemento visual dominante nem persistir o segredo em telas onde não seja necessário.

### 8.7 Gestão de links

Status visuais:

- Ativo;
- Utilizado;
- Expirado;
- Revogado.

Toda representação deve combinar cor + texto, nunca somente cor.

### 8.8 Dashboard

A forma recomendada de apresentação dos indicadores é:

- cards para KPIs principais;
- gráfico de linha para volume por dia;
- gráfico de barras para distribuição por status;
- ranking de volume por loja;
- tabela de lojas com pendências.

Os gráficos devem:

- possuir título;
- utilizar legendas quando necessário;
- evitar excesso de categorias simultâneas;
- oferecer valores legíveis sem depender exclusivamente de hover;
- respeitar filtros de período e escopo do usuário.

---

## 9. Notificações

### 9.1 Nova receita

Quando uma nova receita chegar no Admin:

- apresentar toast ou notificação equivalente;
- atualizar badge/contador quando aplicável;
- destacar o item novo na fila;
- manter feedback mesmo quando o som estiver desativado.

### 9.2 Som

O alerta sonoro deve ser:

- curto;
- não invasivo;
- reproduzido uma única vez por evento;
- controlável pelo usuário;
- dependente de permissão/interação do navegador quando necessário.

---

## 10. Componentes mínimos do Design System

### 10.1 Foundation

- Logo/Brand;
- Typography;
- Color tokens;
- Spacing;
- Grid;
- Radius;
- Borders;
- Elevation;
- Icons.

### 10.2 Inputs

- Text input;
- CPF input;
- Search input;
- Select;
- Date range;
- Checkbox;
- Switch;
- TOTP input;
- File upload/dropzone.

### 10.3 Actions

- Primary button;
- Secondary button;
- Tertiary/text button;
- Destructive button;
- Icon button;
- Copy action;
- Download action.

### 10.4 Feedback

- Inline error;
- Success state;
- Warning;
- Info;
- Toast;
- Loading spinner/progress;
- Empty state;
- Skeleton;
- Disabled state.

### 10.5 Data display

- Card;
- KPI card;
- Table;
- Status badge;
- File item;
- Avatar/initials quando necessário;
- Timeline/history;
- Chart container.

### 10.6 Navigation

- Admin sidebar/navigation;
- Breadcrumb quando necessário;
- Tabs, somente quando houver conteúdo claramente segmentado;
- Pagination ou carregamento incremental para listas extensas.

### 10.7 Overlays

- Modal de confirmação;
- Dialog de ação destrutiva;
- Drawer quando útil para filtros ou detalhes secundários;
- Tooltip somente para conteúdo complementar, nunca essencial.

---

## 11. Estados de componentes

Todo componente interativo deverá documentar, quando aplicável:

- default;
- hover;
- focus;
- active/pressed;
- selected;
- disabled;
- loading;
- success;
- warning;
- error.

O foco deve ser sempre visível para navegação por teclado.

---

## 12. Acessibilidade

Diretrizes mínimas:

- seguir WCAG 2.2 AA como referência;
- contraste adequado;
- não depender apenas de cor para significado;
- labels associados a campos;
- foco visível;
- áreas clicáveis/tocáveis confortáveis;
- navegação completa por teclado no Admin;
- mensagens de erro associadas ao campo correspondente;
- status dinâmicos anunciáveis por tecnologias assistivas quando aplicável;
- ícones funcionais devem possuir nome acessível;
- imagens de receita são conteúdo documental e devem possuir tratamento adequado no viewer, sem tentar criar descrições clínicas automáticas no MVP.

---

## 13. Wireframes textuais

### 13.1 Tela pública — mobile

```text
+----------------------------------+
|            VENANCIO              |
|                                  |
|        Envio de receita          |
|                                  |
| Envie sua receita médica para    |
| esta loja.                       |
|                                  |
| Loja: Venancio #123              |
|                                  |
| CPF do paciente (opcional)       |
| [____________________________]   |
|                                  |
| +------------------------------+ |
| |            ↑                 | |
| |      Escolher arquivos       | |
| |        / Tirar foto          | |
| +------------------------------+ |
|                                  |
| Arquivo 1.jpg        2,1 MB  X   |
| Receita.pdf           1,4 MB  X   |
|                                  |
| Até 10 arquivos, máx. 5 MB cada |
|                                  |
| [       reCAPTCHA              ] |
|                                  |
| [           Enviar             ] |
|        (desabilitado)            |
|                                  |
| Política de Privacidade          |
+----------------------------------+
```

### 13.2 Tela pública — sucesso

```text
+----------------------------------+
|            VENANCIO              |
|                                  |
|               ✓                  |
|                                  |
|   Receita enviada com sucesso.   |
|                                  |
+----------------------------------+
```

### 13.3 Tela pública — link personalizado

```text
+----------------------------------+
|            VENANCIO              |
|                                  |
|        Envio de receita          |
|                                  |
| Envie sua receita para esta      |
| unidade da Drogaria Venancio.    |
|                                  |
| Loja: Venancio #123              |
|                                  |
| +------------------------------+ |
| |            ↑                 | |
| |      Escolher arquivos       | |
| |        / Tirar foto          | |
| +------------------------------+ |
|                                  |
| Até 10 arquivos, máx. 5 MB cada |
|                                  |
| [       reCAPTCHA              ] |
|                                  |
| [           Enviar             ] |
|                                  |
+----------------------------------+
```

O campo CPF não é exibido porque paciente e loja já foram resolvidos pelo token no backend.

### 13.4 Admin — gerar link personalizado

```text
+--------------------------------------------------+
| Gerar link para envio de receita                 |
+--------------------------------------------------+
| Loja                                             |
| [ Venancio #123                         v ]       |
|                                                  |
| Buscar paciente                                  |
| [ CPF, telefone ou e-mail_______________ ]       |
|                                                  |
| Resultado                                        |
| João S. | CPF ***.***.***-12 | Tel. *****-1234   |
| [ Selecionar ]                                   |
|                                                  |
| Validade: [ 7 dias v ]                           |
|                                                  |
| [ Gerar link ]                                   |
+--------------------------------------------------+
| https://receita.venancio.com.br/p/<token>        |
| [ Copiar link ]                                  |
+--------------------------------------------------+
```

### 13.5 Admin — fila

```text
+---------------------------------------------------------------+
| VENANCIO | Receitas                         🔔  Usuário        |
+---------------------------------------------------------------+
| Dashboard | Receitas | Links | Lojas | Usuários | Configurações|
+---------------------------------------------------------------+
| Novas 12 | Sem paciente 5 | Em atendimento 18 | Finalizadas 40|
+---------------------------------------------------------------+
| Filtros: Loja | Status | Identificação | Período              |
+---------------------------------------------------------------+
| Hora  Loja   Paciente         Status      Arquivos  Ação       |
| 14:22 #123   Não identificado Recebida       2      Abrir      |
| 14:18 #123   João S.          Em análise      1      Abrir      |
| 14:03 #124   Maria A.         Finalizada      3      Abrir      |
+---------------------------------------------------------------+
```

### 13.6 Admin — detalhe

```text
+--------------------------------------------------+
| Receita #interno                                 |
| Loja 123 | Recebida em 01/10/2026 14:22         |
+--------------------------------------------------+
| Paciente                                         |
| Não identificado                                 |
| [ Vincular paciente ]                            |
+--------------------------------------------------+
| Status                                           |
| [ Recebida v ]                                   |
+--------------------------------------------------+
| Arquivos                                         |
| [ Receita_1.jpg ] [ Visualizar ] [ Baixar ]      |
| [ Receita_2.pdf ] [ Visualizar ] [ Baixar ]      |
+--------------------------------------------------+
| Histórico                                        |
| 14:22 Receita recebida                           |
| 14:23 Visualizada por colaborador X              |
+--------------------------------------------------+
```

---

## 14. Referências visuais fornecidas

### 14.1 Desktop

Arquivo esperado no projeto:

`/docs/design/references/dasa-upload-desktop.png`

Aspectos a observar:

- conteúdo com largura controlada;
- grande área de upload;
- hierarquia simples;
- botão de seleção de arquivos em destaque;
- instruções imediatamente próximas ao upload;
- separação clara entre conteúdo e ações finais.

### 14.2 Mobile

Arquivo esperado no projeto:

`/docs/design/references/dasa-upload-mobile.png`

Aspectos a observar:

- adaptação fluida para uma coluna;
- área de upload ocupando boa parte da largura útil;
- texto de apoio legível;
- botões com boa área de toque;
- conteúdo sem navegação ou elementos desnecessários.

### 14.3 O que não copiar da referência

- logotipo Dasa/Nav;
- paleta azul da Dasa;
- tipografia específica da Dasa;
- textos institucionais da Dasa;
- links de privacidade da Dasa;
- qualquer elemento que não faça sentido para a jornada Venancio.

---

## 15. Checklist para implementação de novas telas

Antes de considerar uma tela concluída, validar:

- usa componentes existentes antes de criar novos;
- usa tokens, não valores visuais isolados;
- utiliza logo a partir de `/img/logo/`;
- funciona em mobile e desktop conforme o contexto;
- possui todos os estados de loading, erro, vazio e sucesso necessários;
- mantém foco visível;
- não depende somente de cor;
- não expõe CPF, dados de paciente ou conteúdo de receita sem necessidade;
- mantém microcopy coerente com este documento;
- quando uma nova referência for adicionada, ela está em `/docs/design/references/`;
- qualquer nova decisão sistêmica foi documentada neste `DESIGN.md`.

---

## 16. Pontos pendentes de Design System

Antes do handoff visual final, definir com os assets oficiais da Venancio:

1. família tipográfica oficial;
2. valores HEX/RGB dos tokens de marca;
3. variações de logotipo disponíveis em `/img/logo/`;
4. iconografia preferencial;
5. radius e elevação oficiais;
6. breakpoints finais;
7. densidade visual definitiva do Admin;
8. padrão final de gráficos;
9. tema claro apenas ou preparação para tema escuro;
10. revisão de acessibilidade e contraste dos tokens finais.
