# JARBAS — seu mordomo pessoal

Um único lugar para tudo que é seu: agenda, finanças, listas de compras, mapas mentais
para estudo, atas de reunião, apresentações, escrita para redes e um teleprompter de
emissora. Por cima de tudo isso mora o **JARBAS** — um mordomo que conhece a sua rotina,
conversa por voz e resolve por você.

Não é um site para mostrar aos outros. É um painel privado que você abre ao ligar o
computador e fecha ao desligar.

---

## Começar em 2 minutos

1. **Baixe a pasta** para o seu PC (ex.: `C:\Jarbas`).
2. **Dê dois cliques em `start.bat`.**
   Ele sobe um servidor local e abre o hub numa janela limpa do Chrome.
   Uma janela preta fica aberta — é o servidor. Fechá-la desliga o JARBAS.
3. Pronto. Agenda, finanças, compras, mapas, reuniões e apresentações já funcionam,
   **offline, sem depender de nada**.

> **Por que não dá para abrir o `index.html` direto?**
> Navegadores bloqueiam módulos JavaScript e banco de dados local em páginas abertas
> como arquivo (`file://`). O `start.bat` resolve isso servindo em `http://localhost`.
> Esse endereço também é o único em que o Chrome libera o microfone sem HTTPS.

---

## Publicar na Vercel (e abrir do iPhone, de qualquer lugar)

Sem HTTPS o iPhone não instala o app nem libera o microfone. Publicar resolve os dois de
uma vez, e o repositório já vem com o `vercel.json` pronto — **não há build, a Vercel só
serve os arquivos**.

1. Entre em [vercel.com](https://vercel.com) com a sua conta do GitHub.
2. **Add New… → Project** e escolha o repositório `Jarbas`.
3. Em *Framework Preset* deixe **Other**. Não preencha build nem output — o `vercel.json`
   já diz que a raiz é a saída.
4. **Deploy.** Em cerca de um minuto sai um endereço `https://…vercel.app`.

Abra esse endereço no **Safari do iPhone** → botão de compartilhar → **Adicionar à Tela de
Início**. Ele vira um ícone de aplicativo: tela cheia, sem barra de endereço, respeitando a
ilha dinâmica e o indicador de home.

**Entre na sua conta em Ajustes.** Sem isso o celular abre um hub vazio: os dados moram no
navegador de cada aparelho, e é a conta que sincroniza os dois.

### O que fica público e o que não fica

Os **arquivos do programa** ficam num endereço público — qualquer um com o link vê a
interface vazia. Os **seus dados** não: continuam atrás do login, com a política do banco
que garante que cada conta só enxerga as próprias linhas.

Se quiser fechar também os arquivos, ponha o **Cloudflare Access** na frente do domínio, ou
troque o projeto na Vercel para *Deployment Protection → Vercel Authentication* — aí só quem
estiver logado na sua conta da Vercel abre a página.

### Voz no iPhone

O reconhecimento de fala no iOS existe só no Safari, e é instável quando o app foi adicionado
à tela de início. Se o microfone não responder no ícone, abra o mesmo endereço pelo Safari
para ditar — a **fala** do JARBAS (ele responder em voz alta) funciona nos dois casos. O app
detecta a situação e explica isso na tela em vez de mandar você "usar o Chrome".

---

## Instalar como aplicativo de verdade

O `start.bat` já abre numa janela limpa, mas continua sendo um navegador com um servidor
atrás. Dá para instalar o JARBAS como programa do Windows — **ícone no menu Iniciar, janela
própria, sem barra de endereço, e abrindo com o servidor desligado.**

**Uma vez só:**

1. Rode o `start.bat` normalmente.
2. No Chrome, menu **⋮** → **Transmitir, salvar e compartilhar** → **Instalar página como app**.
   (No Edge: **⋯** → **Aplicativos** → **Instalar este site como um aplicativo**.)
   Se aparecer um ícone de instalar na barra de endereço, ele faz o mesmo.
3. Confirme o nome **JARBAS**.

Pronto. Ele vira um aplicativo: aparece no menu Iniciar, dá para fixar na barra de tarefas,
e abre em janela própria. Clique com o botão direito no ícone e você acha atalhos diretos
para Agenda, Finanças e Teleprompter.

**A partir daí você não precisa mais do `start.bat`.** Um service worker guarda o programa
inteiro no navegador, então o app abre com o servidor desligado e sem internet — testado
com o servidor derrubado: as dez telas carregam normalmente.

> **Quando o `start.bat` ainda é necessário:** depois de atualizar os arquivos do JARBAS.
> Suba o servidor uma vez e abra o app — ele pega a versão nova e volta a dispensar o
> servidor. O endereço fica gravado como `http://localhost:7331`, então não mude a porta
> no `start.bat` depois de instalar; se mudar, é só instalar de novo.

O microfone continua funcionando: `localhost` conta como origem segura, e a permissão que
você deu uma vez vale para o aplicativo instalado.

### Abrir junto com o Windows

Dois cliques em **`instalar-inicializacao.bat`** e confirme.
Para desfazer, rode o mesmo arquivo de novo — ele detecta e oferece remover.

Se você instalou o JARBAS como aplicativo, prefira colocar o **atalho do app instalado** na
pasta de inicialização (`Win+R` → `shell:startup`): abre mais rápido e sem a janela preta.

---

## Ligar o cérebro do JARBAS

O hub inteiro funciona sem isso. Mas o JARBAS só pensa depois de **duas** coisas: a sua
chave da Anthropic guardada no servidor, e uma conta criada no app.

O projeto na nuvem **já está criado e configurado** (banco, políticas de segurança e a
função do assistente já estão no ar, e o app já vem apontando para ele).

### 1. Guardar a sua chave da Anthropic

```bash
# 1) instale a CLI do Supabase (uma vez):  https://supabase.com/docs/guides/cli
# 2) faça login e aponte para o projeto:
supabase login
supabase link --project-ref kikedkajnytdjncrkoxf

# 3) guarde a chave (pegue em https://console.anthropic.com/settings/keys)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Prefere sem terminal? Dá para colar a chave direto no painel do Supabase, em
**Project Settings → Edge Functions → Secrets**, com o nome `ANTHROPIC_API_KEY`.

**A chave nunca passa pelo navegador.** Ela fica guardada no servidor; o app só conversa
com a função `jarbas`, que fala com a Anthropic em nome dele.

### Contar quem você é

Em **Ajustes → Sobre você** há um campo de texto livre que vai no topo do contexto de
toda pergunta. É onde mora idade, família, time, o que você faz, o que te irrita.

Não é enfeite: é a diferença entre o JARBAS responder como um assistente genérico e
responder como alguém que te conhece. Ele lê isso antes de qualquer coisa — se você
disser que torce pelo Sport, ele comemora a vitória e alfineta a derrota; se disser que
odeia reunião depois das 17h, ele avisa quando você marcar uma.

É dado, não código: dá para reescrever quando quiser, sem me chamar.

### 2. Criar sua conta

Abra **Ajustes → Nuvem e sincronização → Criar conta**, com e-mail e senha.

Isso **não é opcional para o JARBAS**: a função `jarbas` só aceita chamadas assinadas por
um usuário de verdade, então sem estar logado ele responde *"Não autenticado."*. De quebra,
a conta é o que sincroniza o hub entre os seus aparelhos — use a mesma em outro computador
e os dados aparecem lá. Uma política de segurança no banco garante que cada conta só
enxerga as próprias linhas.

Sem conta, todo o resto continua funcionando — só fica guardado apenas neste PC, e o
assistente fica mudo.

---

## Falar com o JARBAS

Três jeitos, todos em qualquer tela:

| Como | O que faz |
|---|---|
| **Segurar `Ctrl + Espaço`** | Fala enquanto segura, solta e ele responde. É o mais rápido. |
| **Botão 🎙 no painel** | Escuta contínua. Comece a frase com **"Jarbas, ..."**. |
| **Digitar** | Quando você não quiser falar em voz alta. |

Ele responde falando (dá para silenciar no 🔊). **Pode interromper falando por cima** —
ele para na hora e escuta.

### Coisas que ele entende

```
"Jarbas, marca dentista quinta às 10 da manhã"
"gastei oitenta e cinco reais no mercado hoje"
"o que eu tenho amanhã?"
"como estão minhas finanças esse mês?"
"monta um mapa mental sobre cálculo diferencial"
"faz uma apresentação de dez minutos sobre segurança da informação"
"lembra que eu prefiro reuniões de manhã"
"o que eu deveria olhar hoje?"
```

Ele **age de verdade**: cria o compromisso, lança a despesa, monta o mapa e abre na tela.
Quando falta um dado essencial (a data, o valor), ele pergunta em vez de inventar.

### Memória

O JARBAS acumula três camadas de contexto:

- **Seus dados agora** — agenda, saldos, orçamentos, listas e pendências, montados a cada pergunta.
- **Memória de longo prazo** — quando você diz *"lembre que..."*, vira um fato permanente.
  Veja e apague em Ajustes → Assistente.
- **Conversas anteriores** — os assuntos que vocês já trataram entram no contexto,
  então ele liga os pontos entre semanas.

---

## O que tem dentro

| Seção | Para quê |
|---|---|
| **Painel** | O resumo do dia e os "sinais" — orçamento estourando, tarefa atrasada, dia cheio amanhã. |
| **Agenda** | Calendário mensal, compromissos com recorrência e tarefas com prazo. |
| **Finanças** | Contas e saldos, lançamentos, orçamentos por categoria, gráfico do mês, exportação em CSV. |
| **Compras** | Várias listas. Digite `arroz 2 12,90` e ele entende item, quantidade e preço. Ao finalizar, vira despesa no financeiro. |
| **Mind maps** | Editor visual para estudo. Ramos coloridos, anotação por nó, exportação em SVG. |
| **Reuniões** | Pauta, anotações, decisões e encaminhamentos com responsável e prazo — que aparecem no Painel até serem fechados. |
| **Apresentações** | De um tópico a um deck navegável. Modo de exibição em tela cheia, roteiro de fala, exportação em HTML (que vira PDF com `Ctrl+P`). |
| **Copywriter** | Escrita para redes, roteiros e campanhas, com contador por plataforma, variações A/B, voz de marca e leitura de métricas do Meta Business. |
| **Freela** | O que é o trabalho, para quem, qual a sua função, quanto paga, quando paga. Marcar como pago lança a entrada no financeiro sozinho. Entregas e recebimentos aparecem na Agenda. |
| **Eventos** | Orçamento, cachê, equipe (contratada ou da qual você faz parte) e checklist editável de antes, durante e depois. |
| **Rotina** | O que se repete toda semana, com a grade de dias sempre à vista e editável. [Detalhes abaixo](#rotina--o-que-se-repete-toda-semana). |
| **Senhas e acessos** | O cofre. Mapa mental por dentro, criptografia de ponta a ponta por fora. [Detalhes abaixo](#senhas-e-acessos--o-cofre). |
| **Teleprompter** | Editor no PC, exibidor no celular, sincronizados ao vivo. Texto espelhado, rolagem controlada, marcações de operação. |

As seções conversam entre si: a lista de compras vira lançamento, a reunião vira pendência,
o mapa mental vira apresentação, a peça de copy vira compromisso na agenda.

---

## Copywriter

Quatro abas:

- **Peças** — cada post, roteiro, anúncio ou e-mail. O contador conhece o limite real de cada
  plataforma (280 no X, 125 num anúncio do Meta, 2200 no Instagram) e avisa antes de você
  descobrir na hora de publicar. Botões do JARBAS geram variações, encurtam, endurecem o texto,
  transformam em roteiro falado ou revisam. Variações ficam guardadas ao lado — "Usar esta"
  promove uma e rebaixa a atual, sem perder nada.
- **Campanhas** — agrupam peças em torno de um objetivo, um período e uma verba, com barra
  de quanto já está aprovado.
- **Insights** — cole a tabela do Meta Business (ou importe o CSV) e ele lê. O parser detecta
  o separador sozinho, respeita aspas e entende número brasileiro: `12.480` vira doze mil
  quatrocentos e oitenta, `1.250,90` vira mil duzentos e cinquenta e noventa centavos.
  Serve para qualquer tabela — YouTube Studio, Analytics, planilha sua.
- **Marca** — tom de voz, público, o que nunca usar e um exemplo do seu jeito de escrever.
  Isso entra no contexto toda vez que o JARBAS escreve. É o que separa um texto seu de um
  texto genérico de IA.

---

## Teleprompter

Feito no espírito dos prompters de emissora: o operador controla, o apresentador lê.

**No PC (aba Editor)** você escreve e comanda. Linhas entre colchetes viram marcação de
operação — `[VT 30s]`, `[SOBE SOM]` — que aparecem em laranja e não contam como texto lido.
Ao lado, uma miniatura fiel do que o celular está mostrando naquele instante.

**No celular (aba Exibidor & link)** você aponta a câmera para o QR. A página abre em tela
cheia, com a linha-guia onde o apresentador fixa o olhar, e a tela não apaga enquanto ela
estiver aberta.

**Tudo é ao vivo.** Mexeu na velocidade, no tamanho da fonte, na margem, no espelhamento ou
no próprio texto — o celular acompanha na hora. O mesmo vale para rolar, pausar, voltar ao
início e pular parágrafo.

> **Como a rolagem fica lisa mesmo com a rede oscilando:** o editor não manda a posição quadro
> a quadro (isso engasgaria). Ele manda a posição-base e um "estou rolando", e cada lado calcula
> o resto com o próprio relógio. Um estado completo é reenviado a cada 5 segundos, então um
> celular que entrou no meio ou reconectou se alinha sozinho.

### O exibidor não precisa de publicação nenhuma

A página do exibidor é o arquivo `exibidor.html`, servido junto do hub. Nada a rodar, nada a
configurar: se o JARBAS está no ar, o exibidor está.

Já morou numa Edge Function do Supabase, e não funcionava. O gateway deles reescreve a resposta
para `text/plain` e injeta um CSP de sandbox — é a proteção contra usar função como hospedagem
de página. O celular lia o QR e recebia o **código-fonte na tela**, em texto puro. Não há como
contornar de dentro da função; a saída é servir a página de onde páginas são servidas.

A página não carrega roteiro nenhum — o texto chega depois pelo canal, e só para quem tem o
código da sala. A aba **Exibidor & link** confere sozinha, e confere o tipo do conteúdo, não só
o código de resposta: foi um 200 servido como texto que causou o problema acima.

> Quem tiver o link vê o seu roteiro. O código tem 14 caracteres aleatórios; se vazar, o botão
> **Trocar código** invalida o antigo na hora.

---

## Atalhos

| Tecla | Ação |
|---|---|
| `Ctrl + K` | Busca em tudo + paleta de comandos |
| `Ctrl + J` | Abrir/fechar o JARBAS |
| `Ctrl + Espaço` | Segurar para falar |
| `1` a `9`, `0` | Pular direto para uma seção |
| `Esc` | Fechar painel ou janela |

---

## A Agenda mostra o que nasceu em outros módulos

Entrega de freela, recebimento combinado e data de evento **aparecem no calendário**, sem
você recopiar nada. Antes o calendário mostrava uma quinta-feira livre no dia em que havia
uma entrega marcada — a informação existia, só estava no módulo errado.

São compromissos virtuais: têm a mesma forma dos que você marca, mas continuam morando no
módulo dono. Vêm com borda tracejada e **clicar leva ao Freela ou ao Eventos**, onde estão o
valor, o cliente e o resto que a agenda não guarda.

O que entra e o que não entra:

| Entra | Não entra |
|---|---|
| Entrega de freela ainda não entregue | Freela cancelado |
| Recebimento de trabalho **fechado** | Data de pagamento de **proposta** — é estimativa, e estimativa no calendário vira compromisso falso |
| Data de evento | |

---

## Rotina — o que se repete toda semana

Para o que não tem data marcada mas volta sempre: checar o Trello, as postagens da
Universidade, as do Seminário, acompanhar um perfil. Coisa que se esquece justamente
por ser óbvia demais para virar compromisso na agenda.

**Duas partes, numa tela só**

- **Hoje** — a lista do dia, com caixa grande de marcar e a contagem em destaque
  (`2/5`). Quando fecha, o quadro acende em verde. É o que você olha de manhã.
- **A semana** — a grade: linhas são as tarefas, colunas são os dias. Está **sempre
  visível** e é **editável no clique**: tocar numa célula inclui ou tira a tarefa
  daquele dia. Mudar a rotina não exige abrir menu nenhum.

**As cores da grade dizem tudo**

| | |
|---|---|
| Azul com `·` | a tarefa vale nesse dia |
| Verde com `✓` | feita |
| **Vermelho** | o dia passou e ela não foi feita |
| Vazio | não se aplica nesse dia |

Setas navegam entre semanas — dá para olhar para trás e ver o que vem caindo.

**Outros detalhes**

- Cada tarefa aceita **horário**, **contexto** (Universidade, Seminário, Kadu…),
  **link** (abre o Trello ou o perfil direto da lista), observação e **plataforma**.
- A **plataforma vira ícone colorido na grade**: Instagram, Stories, Reels, YouTube,
  Shorts, Meta Ads, TikTok, Facebook, LinkedIn, WhatsApp, Trello, e-mail, site e reunião.
  Numa célula de 34px o desenho diz mais rápido que qualquer texto o que aquele dia pede.
  Ele é **adivinhado pelo título** ("Postar Reels da Universidade" já vem com o ícone certo)
  e continua editável, porque adivinhação erra.
- 🔥 aparece quando você fecha a mesma tarefa duas semanas seguidas ou mais. A conta
  ignora a semana corrente — ela ainda está acontecendo, e zerar a sequência de quem
  só não chegou na sexta seria mentira.
- O histórico de feitos é podado em 120 dias. Sem isso, uma tarefa diária acumularia
  milhares de datas — e esse registro sobe inteiro para a nuvem a cada clique.
- O JARBAS enxerga a rotina: sabe o que está pendente hoje, o que se repete na semana,
  e cria tarefas quando você diz "toda segunda eu preciso…".

---

## Notícias do dia (custo zero)

O primeiro cartão do Painel traz as manchetes por assunto: Mundo, Sport, Música, Seahawks —
e o que mais você quiser. **Nenhum modelo de IA participa disso, e não consome crédito nenhum.**

A notícia não precisa de IA para ser encontrada: ela já vem pronta, de graça, por RSS. IA só
seria necessária para *reescrever* a manchete, que é o passo mais caro e menos útil da corrente.

**Como funciona**

- A função `noticias` do seu Supabase lê os feeds e devolve as manchetes limpas. Ela existe
  porque os sites de notícia não mandam cabeçalho CORS — o navegador não consegue ler um RSS
  direto. Uma chamada por dia, por aparelho.
- O resultado fica guardado até o dia virar. Reabrir o app não busca de novo.
- Antes do horário combinado (padrão 08:00) o cartão fica quieto. O botão ⟳ busca na hora.

**Para deixar funcionando**

```bash
supabase functions deploy noticias
```

Só isso. Nenhum segredo, nenhuma chave — mas é preciso estar logado na sua conta, senão a
função viraria um buscador aberto gastando invocação da sua conta.

**Trocar os assuntos**: Ajustes → Notícias → *Assuntos*. Uma linha por tema, no formato
`Rótulo | consulta`. A sintaxe é a do Google Notícias:

```
Mundo |
Sport | "Sport Club do Recife"
Música | "novo álbum" OR "nova música" OR turnê when:3d
Seahawks | "Seattle Seahawks"
```

Aspas prendem a expressão inteira, `OR` soma alternativas, `when:3d` limita aos últimos dias
e consulta vazia traz as manchetes gerais do dia.

**Se quiser a leitura do JARBAS**, o botão no rodapé do cartão manda as manchetes já buscadas
para ele comentar. Aí sim custa — mas só tokens (centavos), sem taxa de busca, e só quando
você clica.

---

## Senhas e acessos — o cofre

Por dentro é um mapa mental: `Casa → Bancos → Nubank → o acesso`. Cada nó guarda nome,
usuário, senha, endereço, códigos de recuperação e anotações. Por fora, é o único módulo
do sistema com criptografia própria.

**Como funciona**

1. Na primeira vez você define uma **senha-mestra**. Ela vira uma chave AES-256 por
   PBKDF2-SHA256 com 600 mil iterações.
2. Cada mapa de acessos é cifrado inteiro antes de ser gravado. O que vai para o
   IndexedDB, para o Supabase e para o backup é `{ id, iv, ct }` — bytes embaralhados.
   Nem o nome do mapa fica legível.
3. A senha-mestra **não é gravada em lugar nenhum**. A chave vive na memória da aba e
   morre quando o cofre tranca.

**O que isso significa na prática**

- Quem abrir o banco do navegador, o JSON do backup ou a tabela `records` no Supabase não
  vê senha nenhuma. Nem você, sem a senha-mestra.
- **Esquecer a senha-mestra é perder o cofre.** Não existe recuperação, e isso é de
  propósito: se existisse para você, existiria para quem roubasse o banco. Anote em papel.
- A senha-mestra é **separada** da senha da sua conta Supabase. Se forem iguais, quem
  pegar uma pega as duas.

**O que o cofre faz sozinho**

- Tranca depois de 5 minutos sem uso (ajustável no ⚙ da própria tela), ao voltar para a
  aba depois do prazo, e no botão *Trancar agora*.
- Mostra as senhas mascaradas; o olho revela uma por vez e o segredo volta a se esconder
  quando você troca de item.
- Copiar limpa a área de transferência em 30 segundos.
- Gera senhas de 20 caracteres com `crypto.getRandomValues`, e mede a força do que você
  digitar em bits de entropia.
- No desenho do mapa aparecem só os **nomes** — mostrar a tela ou compartilhar a janela
  não vaza credencial. No celular o mapa vira lista, que é o que serve para procurar.

**Trazer acessos de outro lugar**

O botão *↓ importar* aceita o **arquivo `.xmind`** direto (no XMind: *Arquivo → Salvar/Baixar
no dispositivo*) — exportar para Markdown ou OPML é recurso pago, mas o arquivo do mapa é seu.
Um `.xmind` é um ZIP com um `content.json` dentro, e o app abre os dois sozinho, sem
biblioteca nenhuma. Também aceita Markdown, OPML e lista indentada coladas na caixa.

Do arquivo do XMind ele lê **título, subtópicos, notas e etiquetas** — porque credencial em
mapa mental real aparece nos três lugares. Tópicos soltos (*detached*) entram junto. A hierarquia vira a árvore do cofre, e
linhas no formato `senha: …`, `usuário: …`, `url: …`, `2FA: …` e `obs: …` viram **campos do
item acima delas** em vez de virarem itens soltos.

Você cola o texto; o seu navegador interpreta e cifra com a sua senha-mestra antes de
gravar. **Nada disso passa por mim nem sobe em texto claro** — e é exatamente por isso que
a importação é colar, e não me mandar o link do arquivo. Para eu escrever no cofre eu
precisaria da sua senha-mestra, e se eu pudesse ter essa senha o cofre não protegeria nada.

**O JARBAS não enxerga o cofre.** A coleção não entra no contexto que vai junto das suas
perguntas, não existe ferramenta que a leia, e ela não aparece na busca global. É o único
módulo invisível para ele, e é intencional: o que vira contexto sai da sua máquina.

---

## Entrar

Com a nuvem configurada, o JARBAS não abre nada antes de saber quem está do outro lado:
a primeira tela é a marca e uma caixa de login. Nem o menu aparece — montar o hub e
esconder os módulos depois seria mostrar, por um instante, o que não é para ser mostrado,
e um instante é tempo de sobra para uma captura de tela.

A sessão fica guardada no aparelho, então isto só pesa no primeiro acesso: **entrar exige
internet uma vez**; depois disso o app abre offline naquele aparelho, como sempre abriu.
Quem sair da conta volta a precisar de rede para entrar de novo.

Sem nuvem configurada não há login a fazer — o app é local, de um dono só, e uma tranca
sem chave só trancaria o próprio dono do lado de fora.

---

## ADMIN — convidar alguém para usar o JARBAS

O módulo **ADMIN** só aparece para você. Nele você gera um link, escolhe **quais módulos**
a pessoa vai ter, e aprova (ou não) o cadastro dela.

### A regra de ouro, e onde ela mora

A primeira conta do projeto é o super admin. Só ela inclui e exclui gente. Isso **não é
decidido pelo navegador** — se fosse, bastaria abrir o console para se autopromover. A
autoridade está em três lugares, todos fora do alcance de quem usa o app:

1. **A Edge Function `admin`** guarda a chave de serviço num segredo do projeto e confere,
   no servidor de autenticação, quem está pedindo antes de fazer qualquer coisa.
2. **As tabelas `contas` e `convites`** não têm nenhuma política de escrita. Com a chave
   publicável — a única que o navegador tem — dá para ler a própria conta e mais nada.
3. **O portão de verdade é o do Supabase**: a conta do convidado nasce com o e-mail *não
   confirmado*, e usuário não confirmado não faz login. Aprovar é mandar o e-mail de
   confirmação. Antes disso não existe sessão para ele em aparelho nenhum.

A lista de módulos, essa sim, é curadoria: decide o que aparece no menu dela. O que protege
os **seus** dados é outra coisa e é mais forte — cada conta só enxerga as próprias linhas no
banco. O pior que alguém consegue forçando um módulo escondido é usá-lo sobre os próprios
dados vazios.

### Instalar (uma vez)

**As tabelas já foram criadas** no projeto `kikedkajnytdjncrkoxf`. Falta a função.

**As tabelas e a função já estão publicadas** no projeto `kikedkajnytdjncrkoxf`.

Se um dia precisar refazer, duas armadilhas que custam uma tarde:

- **O que vale é o SLUG, não o nome.** Criando pelo painel, o Supabase sorteia um slug
  (do tipo `rapid-responder`) e o campo que você digita é só o rótulo de exibição — a URL
  continua sendo a do slug. O app chama `/functions/v1/admin`, então o slug tem de ser
  exatamente `admin`. Pela CLI isso não acontece: o nome que você passa vira o slug.
- **Verify JWT desligado.** Duas ações acontecem antes de existir conta — ver o convite e
  criar a conta —, e com ele ligado o portal recusa a chamada antes de a função rodar. A
  conferência de quem pede é feita dentro da função, ação por ação.

E um detalhe que engana: uma função que não existe responde 404 **sem cabeçalhos de CORS**,
então o navegador bloqueia antes de entregar e o erro chega como "Failed to fetch" — igual a
internet caída. Por isso o ADMIN pergunta se o projeto responde antes de acusar a rede.

Ou pela CLI, se preferir:

```bash
supabase functions deploy admin --no-verify-jwt

# opcional: fixa quem é o super admin. Sem isto é o usuário mais antigo — você.
supabase secrets set SUPER_ADMIN_ID=<seu-uuid>
# opcional: para onde o link do e-mail leva
supabase secrets set SITE_URL=https://jarbas-pi.vercel.app
```

E confirme, em **Authentication › Providers › Email**, que **Confirm email** está ligado:
https://supabase.com/dashboard/project/kikedkajnytdjncrkoxf/auth/providers

### Se o e-mail não sair

Acontece, e o ADMIN não esconde: em vez de um aviso passageiro, ele abre uma janela
dizendo que a pessoa **já está liberada** e entregando um **link de entrada** para você
mandar por onde quiser. A aprovação nunca fica pela metade por causa do correio.

### O e-mail — leia antes de convidar alguém de verdade

Quem envia é o **seu projeto Supabase**, não o JARBAS. O remetente embutido dele manda
**poucas mensagens por hora** e, em projetos novos, **só para o seu próprio endereço**.
Então, do jeito que está, aprovar funciona mas a pessoa provavelmente não recebe o aviso.

Para valer, configure um SMTP próprio em **Authentication › Emails › SMTP Settings**
(https://supabase.com/dashboard/project/_/auth/smtp) — Resend, Brevo e SendGrid têm plano
grátis que dá e sobra. Depois de configurar, o botão **Reenviar e-mail** no ADMIN resolve
quem ficou para trás.

Confirme também que **Confirm email** está ligado em Authentication › Providers › Email. É
essa opção que faz a aprovação segurar a porta; desligada, o cadastro entraria direto.

### Como fica para quem recebe o link

1. Abre o link e vê **"Crie sua conta"**, com a lista do que foi liberado.
2. Cria a conta. Ela nasce **pendente** — e a tela diz isso, sem enrolação.
3. Você aprova no ADMIN. O e-mail de confirmação sai.
4. Ela confirma, entra, e o JARBAS abre **zerado**: os módulos que você escolheu, todos
   vazios.
5. A primeira coisa que ele pede é o **"Sobre mim"**; depois, as **preferências de
   notícias**. As duas telas têm "Depois" — obrigar alguém a escrever sobre si para poder
   abrir o app faz a pessoa inventar qualquer coisa.

---

## Onde ficam seus dados

- **Neste computador**, no IndexedDB do navegador. É a fonte principal — o app lê e escreve
  aqui primeiro, por isso funciona sem internet.
- **No seu projeto Supabase**, se você criar conta. Só para sincronizar entre dispositivos.
- **Backup em arquivo**: Ajustes → Backup local → Exportar. Um JSON que você guarda onde quiser.

Ao conversar com o JARBAS, um **resumo** dos seus dados vai junto da pergunta (é o que
permite a ele responder com números reais). Nada além desse resumo sai da sua máquina —
e o cofre de senhas não entra nesse resumo em hipótese nenhuma.

Nos três lugares acima, o módulo **Senhas e acessos** está cifrado. Um backup do sistema
inteiro, nas mãos de outra pessoa, entrega tudo menos o cofre.

> ⚠️ Um backup vale mais que arrependimento: exporte antes de mexer em "Apagar tudo"
> ou de importar um arquivo com a opção "Substituir".

---

## Quando algo não funciona

| Sintoma | O que é |
|---|---|
| Tela de erro citando `file://` | Você abriu o `index.html` direto. Use o `start.bat`. |
| "Não encontrei Python nem Node.js" | Instale um dos dois (o `start.bat` mostra os links). São gratuitos. |
| O microfone não faz nada | Reconhecimento de voz só existe no Chrome e no Edge. E autorize o microfone quando o navegador perguntar. |
| Ele responde "preciso que você entre na sua conta" | Ajustes → Nuvem → Entrar. |
| "A chave da Anthropic foi recusada" | O segredo `ANTHROPIC_API_KEY` está errado ou não foi definido. Veja *Ligar o cérebro do JARBAS*. |
| O JARBAS fica mudo mas o resto funciona | É o esperado sem internet. Seus dados continuam todos acessíveis. |
| O celular abre o exibidor e fica em "conectando" | O editor precisa estar aberto na aba do Teleprompter. Confira também se você entrou na conta em Ajustes. |
| O celular mostra código-fonte em vez do teleprompter | O servidor está entregando `exibidor.html` como texto em vez de página. A aba **Exibidor & link** detecta e diz qual tipo veio. |
| A voz corta no meio de textos longos | Bug conhecido do Chrome; o app já contorna. Se persistir, reduza a velocidade da fala em Ajustes. |

---

## Por dentro

Sem framework, sem build, sem `node_modules`. São módulos JavaScript nativos que o
navegador carrega direto — o app abre instantaneamente e não quebra com o tempo por
causa de dependência desatualizada.

```
index.html
start.bat                     sobe o servidor local e abre o hub
instalar-inicializacao.bat    abre junto com o Windows
app/
  core/       db (IndexedDB), store (cache + regras), sync, supabase, settings,
              realtime (canal ao vivo), qr (gerador próprio), bus, util
  ui/         shell (rotas, paleta, navegação), components (modal, formulário, toast)
  views/      as 10 telas
  assistant/  jarbas (conversa), voice (fala e escuta), context (retrato dos dados),
              tools (o que ele pode fazer), orb (o visual reativo)
styles/       base (tokens e casca), views (cada tela)
supabase/
  functions/jarbas/    a função que guarda a chave e chama o Claude
```

`exibidor.html`, na raiz, é a página que o celular abre no teleprompter.

O laço de ferramentas roda **no seu navegador**: o Claude pede uma ação, o app executa
localmente sobre os seus dados e devolve o resultado. A função na nuvem é só um porteiro
para a chave da API.

O modelo é o `claude-opus-5`. A profundidade de raciocínio é ajustável em Ajustes →
Assistente — `low` para respostas rápidas e baratas, `xhigh` para análises pesadas.

---

## Tipografia

| Papel | Fonte pedida | O que está hospedado |
|---|---|---|
| **Destaque** — saudação, números, títulos, marca | Gotham Bold | Montserrat 700/800 |
| **Subtítulo e rótulo** — cabeçalhos de cartão, legendas, relógio | Bebas Neue | Bebas Neue |
| **Corpo** — texto, listas, conversa com o JARBAS | Creato Display | Figtree |
| **Dados** — horas, valores, códigos, roteiro | — | IBM Plex Mono |

**Gotham e Creato são licenciadas** e não podem ser redistribuídas com o projeto. Os
nomes reais vêm primeiro na pilha do CSS: se você tiver a licença instalada no
computador, o navegador usa as de verdade sem mudar uma linha. Sem elas, cai nas
substitutas livres. Detalhes em `assets/fontes/LEIA-ME.md`.

Bebas Neue só tem caixa-alta — por isso é rótulo e subtítulo, nunca corpo.

O **exibidor do teleprompter** carrega a fonte de corpo embutida em base64 na própria
função: o preview do editor e o que aparece no celular precisam quebrar linha no mesmo
lugar, e no meio de um programa ao vivo não dá para depender de rede.
