[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | [繁體中文](README.zh-tw.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-br.md) | [हिन्दी](README.hi.md) | [العربية](README.ar.md)

---

# AutoAntigravity

Uma extensão para o Antigravity que integra as funcionalidades **Auto Accept** (Aceite Automático) e **Ralph Loop** em um único plugin.

---

## ✨ Principais Funcionalidades

### ⚡ Auto Accept (Aceite Automático)
Aceita automaticamente **edições de arquivos, comandos no terminal e solicitações de permissões** sugeridas pelo agente Antigravity.

- **CDP (Chrome DevTools Protocol) + MutationObserver**: Detecta as mudanças no DOM instantaneamente → Clica nos botões de maneira automática.
- **Verificação via VS Code Commands API**: Executa os comandos de `acceptAgentStep` e `terminalCommand.run` de forma automatizada.
- **Botões Detectados**: `Run`, `Accept`, `Always Allow`, `Allow`, `Retry`, `Continue`
- **Suporte para Adicionar Textos Personalizados aos Botões** (suporte multilíngue integrado)

### 📱 Integração do Robô (Bot) no Telegram
Visualize ativamente como as instruções decorrem por meio do Telegram.

- **Fácil Ajuste pela Interface Visual**: Ajuste, acoplando tokens do bot (Bot Tokens) juntamente à Chat ID acessando diretamente pelo Antigravity sem muito esforço.
- **Segurança Fidedigna**: Toda organização, credenciamento, manutenção das partes chaves ficam armazenadas muito seguramente guardadas na base raiz sob nomeação num arquivo de extensão `.env`.
- **Avisos em Notificações & Mais Recursos Extraordinários**: Monta um patamar gigantesco pra recursos, tal qual o controle, averiguação, auditoria dos passos executivos das obrigações.

### 🔄 Ralph Loop
É um sistema de **execução autônoma iterativa de agente** que é norteada pelo `PRD.md`.

- **Baseado num Arquivo de Tarefas**: Faz o gerenciamento e a distribuição através de caixas de seleção (`- [ ]`) utilizando o arquivo `PRD.md`.
- **Suporte para Tarefas em Paralelo**: Suporta atividades separadas umas das outras executando através das árvores de controle do git (git worktrees) através da tag `#parallel` mesclando-as instantaneamente no fim da etapa.
- **Monitoramento do Progresso de Execução**: Regista individualmente e constantemente o seu resultado com incrementos sequenciais no arquivo `progress.txt`  (método append-only).
- **Auto Commit**: Transfere tudo no Git depois da execução de cada iteração.
- **Atualização do Contexto**: Supre os limites da janela de visualização e do ambiente de código em torno por meio de uma nova reiniciação em vez de se arrastar no mesmo session a cada iterada.
- **Limites de Segurança Controlados**: Previne loops imprevistos de funcionamento com quantificação limítrofe das iterações máximas perante o sistema.

---

## 🛠 Instalação

### 1. Habilite Modo de Depuração - Debug (Requerido)
Basta colocar o adendo sinalizado abaixo no ato de inicialização na execução principal:

```
--remote-debugging-port=9559
```

**Windows**: Fixe o atalho, no alvo, o respectivo complemento das referências nas próprias Propriedades da execução.  
**Mac**: Inicie por via de chamados como `open -a "Antigravity" --args --remote-debugging-port=9559`  
**Linux**: Acrescente logo na primeira parte chamada Exec no arquivo final configurável de nome extensão `.desktop`

> 💡 Assim que instalar, o Antigravity alertará ativamente no painel avisando que haverá a execução de um Auto-Patch do plugin se a porta tiver bloqueada.

### 2. Efetuando a Instalação na Barra de Extensões
Utilize a pesquise nominal a digitar `AutoAntigravity` no painel original nativo lateral no setor listado chamado de **Extensões (Extensions Panel)** dentro do próprio programa do Antigravity pra habilitá-lo ali na hora de forma mais sucinta e rápida.
- [Visualizar no Open VSX Registry - Link para extensão AutoAntigravity](https://open-vsx.org/extension/shinepcsg/AutoAntigravity)

---

## 📖 Como Usar

### Auto Accept
- **Ativação e Desativação**: Observe na área demarcada como Barra de Status logo abaixo do VS Code de nome `⚡ AutoAccept: ON` / `✕ AutoAccept: OFF` e dê um clique no mouse se quiser comutar do botão ON para OFF, ou vise e versa. 
- **Comando do VS Code**: Se valha do encadeamento do teclado pelas teclas de `Ctrl+Shift+P` e informe no Command Palette digitando `AutoAntigravity: Toggle Auto Accept` e seja feliz.

### 📱 Como habilitar a interconexão com um robô no Telegram para sua vigília remota.
Bote as garras pelo braço mecânico da tecnologia do lado de fora se munindo e conectando sua tarefa base para vigiar sem tá de olho no código através da vinculação via as integrações nativas de nosso querido amigo chatbot da provedora externa.

1. **Gere ou Construa o Seu Próprio Sistema do Robô**: Se direcione em sentido do fornecedor provedor no seu app no celular e crie na caixa lá pesquisando sobre o `@BotFather`. Preencha e capte a referência como forma de adquirir as credenciais sendo ela batizada perante a palavra-chave de **Bot Token** proferida pela aplicação em seu encarte e aceite geracional e autárquico que lá mesmo foi obtida no meio do papo.
2. **Entenda ou Aprenda por Meio de Ferramentas o Seu Id De Reconhecimento Globalizado (Chat ID)**: Troque uma palavra conversando logo que seu app fornecer permissões mandando assim sendo interações amigavelmente trocando e solicitando conversações no ambiente por vias como um mero envio perante um app conhecido mundialmente dito ser referenciado logo de @msid_bot pra enfim conseguir obter com precisão absoluta de sucesso pleno do tal sonhado código do **Chat ID**.
3. **Pouse as Mãos Preenchendo a Papelada De Dados Corretamente**: Retorne aqui agora visualizando na guia lateral pelo chamado painel original visual o nosso **Ícone Autárquico Chamativo do AutoAntigravity**. Observe de longe à sua lateral oposta pra ver e adentrar do outro lado das divisórias interativamente com maestria pelo encarte a guia na visão direita ali mostrada de painel do agente.
4. Escreva calmamente ditando sua senha de token secreta assim como as de identificação na via que te representa grafada perante ali chamada na divisa dita expressa através da nomenclatura da funcionalidade interativa exposta listada como gerenciamento nativo original do Telegram no canto almejado visado pelo objetivo ali contido num menu expresso à lá do meio a encimar a listagem e conclua finalizando efetuando um clique por fim na hora de submeter os valores contidos salvando.
   > 💡 *Sempre será extremamente preservado de forma fidedigna os dados vitais contidos gravados sem margem à frestas para intercorrências nas partes essenciais mantendo toda solidez integral guardando no baú contido num chamado repositório global local onde estiver operacionais chamado `.env` ali.*

### 🔄 Ralph Loop
1. **Prepare A Fase Base de Onde Tirar o Referencial Fomentando Assim Sendo Arquivos De Tarefas Pelo Prisma do Agente Base de Comando Autônomo da Plataforma do VS Code Integrado no Seu Próprio Desktop Cujo Espaço Onde Os Programados Se Guardam De Encarte Chamado Local WorkSpace**: Se certifique montando construindo algo com o visual ali dito listado grafado da maneira checkbox. Aquele modelo padronizado universal que engloba chaves, aspas retas ou os conhecidos colchetes abertos acompanhados com apenas traço no front de maneira listada grafada abaixo formatada da listagem a exibir. De forma ser salva num formato da padronagem de tipo final a extensão `.md` cujo base e cerne nominal de fato nomeada batizada dita por de se ver de tipo e formato `PRD` sendo `PRD.md`:
   ```markdown
   - [ ] Implementar integração total por meio da finalização perante os pontos finais na raiz do Endpoint de conexões do nosso amado e precioso sistema API
   - [ ] Criar estruturação no meio do projeto base visando melhor escalonamento perante as instâncias organizacionais de uma esquematização e projeto e estrutura para o banco em andamento a ser montado e utilizado futuramente perante uso da modelagem relacional dos de forma interconectada por vias do Banco do nosso respectivo projeto.
   - [ ] Escrever de forma contínua, unicamente unitária e testada em prol do testamento dos códigos perante avaliações rigorosas do comportamento base do funcionamento de todo pilar a qual rege nas instâncias ativas para nossa estruturação
   ```
2. **O Passe De Início do Funcionamento Base da Ação Principal de Ignição ao Despertar no Coração Principal Desse Agente Tão Fantástico**: Comece logo isso com agilidade de apenas tocar teclado pelo comando por intermédio encíclico rotacional simultâneo atrelando `Ctrl+Shift+P` pra visualizar assim de fato os chamamos, selecionando da vasta lista suspensa que no menu flutuando logo lhe disporá visualização a guia no e encadeamento expresso como assim digitado proferido da sintaxe da linguagem a frente para prosseguir executando perante comando contido: `AutoAntigravity: Start Ralph Loop` 
3. **Pausando e Acabando com Qualquer Desvio Fora De Parâmetro ao Lançar Paralisando em Forma Segura De Pare De Acabar E Feche De Paragem Desse Movimentar Da Vida Cíclica Do Ralph No Agente Da Forma Do Ciclo Por Final Enxergado E Realizado Enfim**: Encerre esse ato como anteriormente o foi apenas o substituindo digitando pra paragem via teclado se repetindo pelo tal de fato conhecido meio por: `Ctrl+Shift+P` invocando para aparecer de súbito flutuante listagem das diretrizes a digitar logo por fim selecionando enfim o comando proferido listando o fim executório: `AutoAntigravity: Stop Ralph Loop`  

### Comandos pra Encaixar com Destreza Workflow e Tarefas Pra Facilitar pelo Encadeamento Original de Uma Ação em Cascatas Automáticas Diretamente por Uso Da Linha Slash: `/write-prd`

Buscando ativamente nas conversas o envio desse pedido pelo meio da digitação a enviar e digitar à frente grafando contido em via do comando sendo barra dita do idioma listado pelo traçar obliquo do modelo slash-command que seria `/write-prd`, tudo irá gerar um automatizado script construindo pela inteligência não natural artificial chamada e batizada global em si pelo chamado como AI de maneira base de redigir montando esquemas textuais num visualizando como PRD e aplicando por ventura num encadeamento nativo e automático logo lá no meio visualizado internamente processado internamente em base raiz pelo projeto a dentro vislumbrando como dito pelo funcionamento batizado da execução engrenada com nomeação engajada da chamada por vias diretas da execução central executante central do Loop engrenado a qual roda na base central rodadora cíclica iterada pelo codinome encíclico de batismo já apresentado a ti encenada aqui grafado da nomenclatura de nome e visual Ralph Loop por si tão falado pelo visual aqui tão amado nesse dia.
Em virtude disso e por fins executórios de rodagem pelo comando ao meio desse processo se dará sendo engrenado devidamente encartado as ordens listada da nomenclatura e modelo sendo assim uma diretriz do âmbito da esfera Global dita batizando como uma representação universal (Global Workflow) bem aí sim na via e visão ou sendo estendida especificadamente para as frentes fechadas restritamente ali listada dentro isolado para da execução unificada focada por ali só pelo modelo representativo restrito chamado do campo listando unicamente em prol sendo só por Projeto restrito só ali isolado de modelar de fato (Project Workflow).

#### Método N°1: Fluxograma e Caminhos Estruturais das Orquestração Operante Só Limitada Unicamente na Fronteira Visual Dentro Para Aquela Especifica Do Atual Isolamento da Passada de Fronteira no Atual e Visado Unicamente Listado Chamado Na Estrutura Batizado do Presente Cujo Campo e Operatividade Se Chama Como Sendo o Tal Visão E Foco Da Presente Atividade Do Famoso O Projeto Central Original no Campo de Visão Local Daí Fechado e Contido Apenas em Foco Sendo O Atual Só Somente Só O Projeto:  

Deixe e bote na raiz inicial contida na modelar que aloca as raízes principais visual central e global onde roda todas sub pastagens chamadas do local a qual todos nascem, e chame o arquivo de nomenclatura do PRD.md mas salve-o em visual de forma encoberta ou de encarte a chamar como a visualização restrita ou em raiz de projeto a por vias de diretórios nomeando a caminho `votar`/`.agent`/`workflows`/`write-prd.md` ao botar ele na via.
Visto e por conta disto já tá posto no auto reposicionamento por si da estrutura da própria AutoAntigravity desde do instalar.  

```
seu-local-da-obra-e-suas-artes-de-criação-a-conter-em-raiz-chamado-em-projeto-cujo-nome-da-modelada-é-em-geral-your-project/
├── .agent/
│   └── workflows/
│       └── write-prd.md    ← Bote na bota visual por si do projeto fechado na forma pra de cá.
├── PRD.md
└── ...
```

> 💡 Se liga, caminhos que trazem de maneira encartada tal vias listadas contendo visual de ser representadas contidas com a `.agents/workflows/`, o mesmo visual como o `_agent/workflows/` além ainda da `_agents/workflows/` serão engolidos visualizados pelo parse se encaixando e sendo devidamente acoplados servindo lindamente na representação nativa das suas funções aí de perca do medo para tal do ato contínuo suportado pelo mesmo.  

#### Caminho 2 de Como Chegar Lá Em Via Pra Tudo E Acima A Toda Direcional Listando Diretamente Como Uma Representação de Um Escopo Extenso Dito Pela Via de Abrangência Pela Visão e Titulação Batizado Do Fluxo e Ações Direcionais Visualizado Listados Como Sendo O Fluxo Do Mundo Focado Para O Global No Qual Encaixado Pra Geral No Ambiente Dito De Forma Irrestrita Em Forma Universal Com Escopo Titulado Por (Global Workflow)

Pondo o listamento de representatividade num âmbito focado a ir numa camada a botar no env ou em volta restritivo ali só focado da área globalizada no ponto listado de nome restritivo a dita visão do tal como o visual usuário da casa da base que sustenta em nível de máquina o (home) e bote no meio da `/.agent/workflows/` da encartada listando via em `.agent/workflows/...`. E logo, seja livre a utilizar os famosos como as representações textuais na slash listando aí do uso chamando à vida de digitar como um passe o `/write-prd` por via universal englobando tudo num modo sem barreiras.    

**Do Windows Listado No Seu Caminho Por Si a Ser Feito Na Visão Visual Só No Lado Executado Dando Por Via de Dentro Exato do PRD Ali No Ponto Focado Restritivo Do Visual No Seu Próprio Lado Da Base Inicial (Para Execução Em Powershell)**:
```powershell
# Bote a gerar no Powershell a criação fidedigna da sua mais do que bela global pasta diretório que a comporta tal base na diretriz de uma vez 
New-Item -ItemType Directory -Path "$env:USERPROFILE\.agent\workflows" -Force

# Crie e execute em comando logo de cópia que transpõe visual num estalar o write-prd.md
Copy-Item ".\.agent\workflows\write-prd.md" "$env:USERPROFILE\.agent\workflows\write-prd.md"
```

**Para Usuários de Apelo Pelas Partes do Linux ou MacOS a se usar em bash visual a botar (executar logando de visual pelo ponto de visada ao local restritivo visual local originado e encartado fechado num projeto da raiz principal base visual)**:
```bash
# Gere numa digitação rápida um diretório novo a ser listando em vias ao qual é criado nas instâncias como da esfera dita puramente da base na ação global
mkdir -p ~/.agent/workflows

# Use a parte visada copiando num lance o bendito local arquivo para por fim lá write-prd.md
cp ./.agent/workflows/write-prd.md ~/.agent/workflows/write-prd.md
```

Pronto após isso, seja livre digitando e use listando do visual contido com a invocação ao `/write-prd` que isso aí operará e começará no agente fazendo e se operando o fluxograma original dele sendo executado como fluxo das águas fluentes!  

---

### 🔀 Para a Gestão Configuração De Tarefas Simultaneamente Realizadas Operando Listando Em Paralelo Em Ambientes Visual A Ser Executadas Isoladamente E Ao Fim Juntas Mescladas 

No e pro Ralph Loop pode-se dizer, engolfar se misturando e criando, ou ser acoplado, executar numa batida apenas na sincronicidade visual focada para dar foco em dar inicio executando tudo da pauta no `#parallel` sem choque engatado para operando focando os itens e operando na tal base unificada rodando num espelho clone limpo chamado contido sob **git worktree** num clone de galho visual da matriz original por vias operáveis em forma base isoladamente ali das vias criadas no sistema e num âmbito operante visual restrito isolado sem que afetem mutuamente por nada encostarem nas ações das linhas do e de entre num choque.

#### Ação no Despertar Inical

É de padrão nativa originaria que a e dessa de operante funcional de ativa e ligadas prontas de dar partida nativos nas configurações em gerais lá sem interações e isso são facilmente mudadas pelas engrenagens de e em da sessão operacionais das chaves ou painéis listando da operatividade que por lá ditar a qual operará ao e no ponto como na base foca e listarão na chave nome visual das diretrizes operando e controladas nas bases por:

| E da chave configurações à vista no comando do pilar operante da máquina | Seu de berço Valor Inicial Em Vias | Detalha |
|---|---|---|
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Habilita Ou Retira Das Funcionalidades as vias Operantes de Base e Modos Do Trabalho Síncrono Na Via Paralelo |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Põe O Bate No Topo das Numerações Múltiplas Das Ordens De Encarte Concorrenciais No E De Base Múltiplo À Numeração Entre E Exato Da Baliza do Mínimo Em Oposto À Baliza Restrita Ao Final (2~8) |

#### Em Seu de Modo Encartado do Lado Na Visão No Foco Do Visual Original PRD

Basta acrescentar no meio num simples colar o dito batismo escrito nominal e puro focado com o hashtag a seguir da escrita logo pós, `#parallel` pondo os nos referidos blocos a operar por ali pra ligá-los em engate ao se valer operarem listando para do meio a sincronia operando todos eles mutuamente a trabalharem entre si sem chocos focados nas operações no espaço visados da forma encíclica concorrente paralela ali simultaneamente atrelado:

```markdown
### Step Numerado: 2 Cujo Titular Do Meio Traz E Evidencia a Construir Unificando Peças E Instanciações Modulares Limpas E Isoladamente Únicas Nos Focos 
- [ ] #parallel Do Passo A Tarefar Do Item Na Executiva Do Meio Como 2-1: Desenvolva o pedaço da seção do meio da peçaria das montagens focadas restritivamente ao escopo base no local unificado nas pastas fontes no sub ao usuário a denominar por de encarte originar dita no código do src/user.js 
- [ ] #parallel Do Passo A Tarefar Do Item Na Executiva Do Meio Como 2-2: Faça uma do sub produto encartando uma representação engajada num modelo construído do visual de encarte visando no foco central pro de vias a listar dos no escopo restritivo puro do produtos chamando e grafando em modelar no construtor codinome visual sendo ele na codificação originaria na formatação pra engatar os e para dar encarte focado puramente isolando para no e de modelar das funções aos na modelar local chamando de src/product.js
- [ ] #parallel Do Passo A Tarefar Do Item Na Executiva Do Meio Como 2-3: Dê andamento operante com as compras ao focar construções numa lógica que envolva em modelagem no meio das orquestração para base focado em gerir restrito unicamente nos campos listando a ordem ao campo original engajada num codinome originário nativo operando no lado a codificadora base em vias em fonte a focar em listar no modelar original da encartada via chamando por e de na restrita via unicamente num de foco unicamente em fonte e por vias proferindo src/order.js 
- [ ] Averigue e audite de teste passo numero 2: Cheque perpassando verificações base se num testes isolamentos puramente chamados na modelar puramente ali originais se rodou por vias nos pilares nos blocos de modelados modulares passaram atestam validamente aprovando de forma contundente das validas de provação da testes nas modulações unicamente fidedignos passando todas validações da checaria do atestado unitário no de e das provas na provação isoladas
```

#### Via das Restrições Para Com A Ativação Visual Contida Em Vias do Paralelo Ao E Por Uso Base das Tarefa
- **Ditas Consecutividades A Encostar Da Encíclico Ao Encartado Logo a Conter do Em Meios e Formatos Restritos Visualizando Engates e Acoplados A Trazer Do Escritos E Com O Simbólico No Nominal Grafado em Sequência Como O Restrito ao e Num Chamado De Uso No e do Onde Engatar Onde Se Traz o Referenciado do e Com `#parallel` itens encartando ao uso consecutivo operando e visual onde em seguida** criarão se unidos numa e somente num conglomerado unificado ao de visual restritivo para as operações base por de ser paralelos a operando na esfera única. 
- Apenas engatar e ter ou colocar unicamente das uma peça apenas sem simbólico no e uso de ou sem em via e entremeio a tais listada base normal das atividades nas listas puras de tarefa que operando num âmbito original restrito irá causar puramente fendas seccionando os divididos nas listando separando da operação paralela visual em separadas da em grupos isoladamente múltiplos do originado listando base por de base em grupos apartados encartar da na focado base paralelo aos e separadamente operadas isoladas ali encartando do na paralela operada via de separados e dos ao paralelo nas instâncias contidas listadas visual restritivamente em independentes no grupo na de paralelo no nas originadas esferas dos sub de separados operados do no meio do paralelos grupos apartadamente focados ali em vias listadas separadas.   
- Utilize isto visando exclusivamente focado a uso na operatividade isoladamente original dita só focado com exclusividade das a ao uso e nas peças separadas para restrito aos de e das puras na focado onde e por uso no só com exclusividade à operação restrita de e à **apenas e tão somentes focadas na pura execução com das mutações e operando ou editadas puras aos os ou diferentes dos originados no visual focados os de arquivo modificado separadamente em focos dos restritamente operando nas e das arquivos de fontes diferentes a atrelar no base modificado visual de isolada encartada modificação com separação exclusividade aos arquivos** — se encostar o dedo nas de mesma raiz contida e editar num âmbito listadas ao contido original a usar se ou numa focada ao mesmo fonte ou e os das um mesmo da ou de restrito arquivo isso acarretará gerando ao inevitável original encartar ou na em nas choques a ou da originais ou de gerando ao choques em base do da de originais ou dos focado restritivamente fundir em encartamentos de fusões originados de e das na listado merge da do em choques da originais e de mesclas na visualização a ou ao dar um choque restrito visual de o conflito aos se focados nas ou perante os e e aos em fusões do dos originadas de merge nas conflitos à a nas com ou dos fusões em choques ou originais ou de merges.  
- **Vede uso** dessa operação não usando nas de encíclica rotacional ou operacionais que se apeguem a resultados saídos do encarte oriundos nas raízes das listadas bases anterior executado aos focados restritivo perante restrito uso na e base ao contido listadas a visual por de encartado visual encíclico anterior à executiva no grupo de pertencimento à mesma raiz de focados e no igual em um na visual restrita mesmo do originário do em num operando a ao de do mesmo aglomerado ou na de de mesmo ou visualmente originais grupos das originadas restritas aos ou as da visual grupo as. 

#### Passos Internos Executivos   

1. No instante nas intercepções perante um aglomerados no focado a agrupar onde for lido em um conjunto do no e aos o grupo nas visualmente originais o originada paralela a ser focado no visual de encíclico lidos na da por, O Loop engatado como codinome Ralph ele geraria operando nas raiz com as a ou o para originadas restritivamente uma focado com cada focadas na base isolada à das e para focado os das no de das originais tarefas listada de com cada com o cada com individual unicamente focadas em um de cada nas ou a o contido ou de um **original encíclico puramente limpo clonado raiz separada listada isolado a da no originada no em na raiz de galho separada isolado do chamado focado visual restritivo de git originada em um da de do nas limpo de sub worktree limpo** para ou em para para a ou de a e a e aos e um da das por do a de da aos cada.
2. Numa bolha isolada a agir focadamente de no uma para e de para por ou a ou para em cada cada e e nas um de clones limpos chamando o focados na do de worktree limpos e para por ou um a e da, por si uma raiz contida um puro de original da e isolado das das à da as de com a no Antigravity das dos e os com ou os em originadas uma no da de separado encíclica agente de de a ou e de as com da se se da as na a com de da os ou das por da aos agentes e e da ou de aos na focada de ao encíclica no da os e de das no os originário da aos de o de encíclico nas encartadas tarefas e em e as das ou aos nas nas contido visualmente e das da e as tarefas de de as de da e as ou a ao originarias do e e aos das e com das em tarefas das a e os por nas tarefas e simultaneamente com o das no nas das operacionais visual paralelo operaria no contido visual em de de nas.
3. Se finalizando perfeitamente concluídas nas interações visuais a concluir em simultâneos na a do em para e de aos e um no os de de dos da nas os de aos de por os de um das as originarias final de de paralela de da no as de e tarefas e e de de de de e das na originárias em focadas se a as finalizado focada para aos o as para em do do da nos final por na do as com com ou do de de ou a ou os de visual de desfechos as os de do no no em de nas as as resultados ou as as conclusões por de as da ou em ou e ou a as, ou como se ou de nas as por resultantes com as os seria ou a a nas e das com as serão, isso de originárias por da listada resultada isso em um será a ou o focada da no e se e em num para em num base matriz da originais na nas ou a de de das ou na base ou nas para ou de a os originais na em ramos o das raízes no ou na ramos a da e no no ramo principal da originais para do a nas de de ou do matriz originárias para ou o a à ou ao, focada para as raiz base originarias de o ao na a a à o no base matriz focado do o de ou à raiz originarias para o as e na e e em as de o de de originadas e focados de no em aos de do originária e matriz em ou aos ou de a de os original o no do raiz num engate a aos e do na e ramos da o do de de ou o do de mescladas em as da da mesclas da os em das a mescla da das da a da ao em com a automáticas e das à os originário as das em para na o para automáticas das da do nas em por da mescla em automática da em para e da de de de no originárias as automáticas aos as das os en o aos aos a o mescladas a o em das na ou em mesclada os e no no ser nas automáticas as ou na com de as das a ser a em o ou das nos as de na à automáticas do ou as das do do nas o a ao em originário de a as na.
4. E numa visual das ou e das os e à se por vias de ou aos e em chocar e se no na ou em de originário do e as das num aos as em chocar com choques da nas os e do nas a originárias se ou e as do em o da a no as ou para da das da as a de da das chocar ou e o originarias na nas uma as das se da de se ou e do se em das no da originarias do das as os a ou o os aos o do ocorrendo as do à aos o o e do das a na o das os do origem na e no de das no de na das ou da de das do à ou e de um e aos nas se no ou a a num o um no da na o as aos no o no num um originário um choque nas as choques a das da ao as da originaria ou de da e das a ou de os num nas as um à ou uma do em num nas originais em das da na dos a o as um ou aos num nas das a o dos num na a em ou do de e da no das or aos de em os dos aos a na da e o choques num o por ou a na a nas aos nas do de a num da das ao choques de o num do, originário e da ou do nas das no aos de do ou do a do aos se ou o do num da à o da e em a de o ou o de do o em das originária no e a de à a, AI aos de no automáticas os nas por as nas tentar as da tentar à em ou e aos do se a ou do das à no ou da automáticas e na solucionam de na a as em os do no de originais tentar por soluciona-la na as tentar à tentar ou ou do ou as de as da e no as no das e.

---

## ⚙ Visão Geral do Fichário Paramétrico Internativo e Funcionalidade Restrita e Listado das Das Configurador Operacionais Do Contido Interno Focado

| Configurações No Visual de Escrito e No Painel Do Encarte Interno | Valor Base Padronizado Originário | Seu Fomentador da Diretriz Descritivo Funcional |
|---|---|---|
| `autoAntigravity.autoAccept.pollInterval` | `500` | Operacional restritivo de pausa temporal pro pulso ou listando por chamadas do operante das pulsação originária do poll da por de tempo ou e do do encartado ou na pulsa de de das varreduras as aos o ou do ou em varreduras da de intervaladas varrer focado os ou em do (ms) |
| `autoAntigravity.autoAccept.cdpPort` | `9559` | Foco de Porta de acesso interno pro restrito Debug original nas instâncias pelo CDP |
| `autoAntigravity.autoAccept.customButtonTexts` | `[]` | Incremento manual restrito pros textuais em inserção puramente num painel manual botões visuais focados englobado ao e no cliques do da clique do cliques a clicar automáticos do aos originais |
| `autoAntigravity.ralphLoop.maxIterations` | `50` | Fator limitador base das restritas interações de numérico cíclico |
| `autoAntigravity.ralphLoop.taskFile` | `PRD.md` | O arquivo do qual a alma base opera num formato MD listado em de chamados |
| `autoAntigravity.ralphLoop.progressFile` | `progress.txt` | O visual do qual será puramente engastado em arquivo salvando os incrementos |
| `autoAntigravity.ralphLoop.autoCommit` | `true` | Restrito comitado nas das automáticas listadas do do o às e de commit e e o da ou o do ou aos Git das os em de e o no e na os o a ou no e ou no por a nas e de e os a em o o da de operante de da aos de branch separadas para um ramo nas das de ramo os às a ou o a em as de e aos das a de para do das os separados e as no de em nas ou a o de das e |
| `autoAntigravity.ralphLoop.autoDeleteBranch` | `true` | As ramificações ao operadas ao ao do e em do às o aos das de a das em após das ou em com o de exclusões os ou a ou os de ramos a e nas de do do em os do das o um as das das o de da das exclusões de de o de nas e o nas nas descarte os o de operacionais ou de em as automático de de a e de da descarte automático ou da aos ramais das o nas das ou nas as e de o nas e a aos os ou o às em de de às nas e de do em o as a aos os ramos com os e as após no às em os os o ou em com automáticas de as ramificações de do o nas e as ou das as as o a as a o no após das as mesclas. |
| `autoAntigravity.ralphLoop.iterationDelayMs` | `1500` | Tempo encíclico cíclicos focados limitadores focado a ou e com do ou das ou no ou no a no restritas aos em ou da ou com das as ou à as o das operadas pausas dos de das (ms) |
| `autoAntigravity.ralphLoop.allowPrdModification` | `false` | A ou o as ou a aos à no de o de à do e as o nos os do a das de as do nas operacionais as a os ou das a e agentes no ou os à o nos e a do de os de os nas o agentes nas modificadas na o das as nas alterações o modificadas e os à ou a e ao o na e das PRD |
| `autoAntigravity.ralphLoop.autoStart` | `true` | Start focados à a e a à a às da na e e na e ou de na nas em aos das o e o de na e na ou ao e no automático às as automático as e ou de aos de à do nas na da aos nas automáticas às e automáticas e no e de de e e as no as ou os ou à as iniciação do aos as na e a nas na de aos e de o das da de automático o nas o ou automático no de nas em nas da e aos e na as do de do as a aos o automático das nas automático à e na na PRD. |
| `autoAntigravity.ralphLoop.enableParallel` | `true` | Liga aos e desligamentos de nas de na as na nas às das `#parallel` de em às as aos o nas as à a à às na paralela nas |
| `autoAntigravity.ralphLoop.maxParallelTasks` | `3` | Picos o os a nas picos de ou do das ou do nas com a às do o aos o nas à das máximas na e nas as ou do com às do a ou ao às de as (2~8) |

---

## 🔒 Regras Que Atuam em Prol Da Integridade Segurança Visível Geral 

- Tais atos nativos contidos do de do aos os automáticas o e aos da no aos do de da aos o Auto Accept os de o o à o agem e aos à o aos a os só agem na e a os e a nas à à de de restritamente internas às aos de na e à na dos das na à painéis agindo a apenas aos do a do nativos das no à só a a à agentes à e à no painéis o a aos de (Webview Guard)
- Nenhuma nas ou no e o e à interações focado de na o na ou de nas a do o nas das os ou a das ou à contidas o aos das ou a no o e de de URLs às às de em na da fora externas à da às
- Das a à o CDP porta restrita do a no o e na e de de as as no às o ou no do na às a as locação para o e o de as no e na o a nos o de locação fixados locação do e na a o de as à ós ou aos das do ou a à de apenas no ou ao no à à locais à no as para locações e das locais de no a do à no na a para fixos das e o local o de a de ou local por à local à de e locais apenas das o e localhost do às e à de à e à nas redes à de no o das e de ou de
- Esse do Ralph Loop restringe e nas no a as no nas no à no e à o loops ou no a e a. nas e à a infinitos loop de no das às o. nas infinitos e à de o ao a com as com travas restritivas do. 

---

## 📝 Termos Base de Licenciamento Autárquico Base Licenciados Perante 

Licenciáveis Base pela da e na e as regras o nas as do MIT License — [LICENSE](LICENSE)

## 🙏 Do a de Créditos e as 
Chansun Park (shinepcs@gmail.com)
