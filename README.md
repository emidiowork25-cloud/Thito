# THITO — seu hub pessoal, com o JARBAS dentro

Um único lugar para tudo que é seu: agenda, finanças, listas de compras, mapas mentais
para estudo, atas de reunião, apresentações, escrita para redes e um teleprompter de
emissora. Por cima de tudo isso mora o **JARBAS** — um assistente que enxerga seus dados,
conversa por voz e age por você.

Não é um site para mostrar aos outros. É um painel privado que você abre ao ligar o
computador e fecha ao desligar.

---

## Começar em 2 minutos

1. **Baixe a pasta** para o seu PC (ex.: `C:\Thito`).
2. **Dê dois cliques em `start.bat`.**
   Ele sobe um servidor local e abre o hub numa janela limpa do Chrome.
   Uma janela preta fica aberta — é o servidor. Fechá-la desliga o THITO.
3. Pronto. Agenda, finanças, compras, mapas, reuniões e apresentações já funcionam,
   **offline, sem depender de nada**.

> **Por que não dá para abrir o `index.html` direto?**
> Navegadores bloqueiam módulos JavaScript e banco de dados local em páginas abertas
> como arquivo (`file://`). O `start.bat` resolve isso servindo em `http://localhost`.
> Esse endereço também é o único em que o Chrome libera o microfone sem HTTPS.

### Abrir junto com o Windows

Dois cliques em **`instalar-inicializacao.bat`** e confirme.
Para desfazer, rode o mesmo arquivo de novo — ele detecta e oferece remover.

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

### Publicar o exibidor (uma vez só)

A página do exibidor mora numa função do seu projeto Supabase, para o celular abrir de qualquer
lugar. Rode uma vez, na pasta do THITO:

```bash
supabase functions deploy prompter --no-verify-jwt
```

O `--no-verify-jwt` é proposital: é o que permite abrir o link só com a câmera, sem login. A
página em si não carrega roteiro nenhum — o texto chega depois pelo canal, e só para quem tem
o código da sala. A aba **Exibidor & link** testa isso sozinha e avisa se ainda faltar publicar.

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

## Onde ficam seus dados

- **Neste computador**, no IndexedDB do navegador. É a fonte principal — o app lê e escreve
  aqui primeiro, por isso funciona sem internet.
- **No seu projeto Supabase**, se você criar conta. Só para sincronizar entre dispositivos.
- **Backup em arquivo**: Ajustes → Backup local → Exportar. Um JSON que você guarda onde quiser.

Ao conversar com o JARBAS, um **resumo** dos seus dados vai junto da pergunta (é o que
permite a ele responder com números reais). Nada além desse resumo sai da sua máquina.

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
| O link do exibidor dá erro no celular | Falta publicar a função uma vez: `supabase functions deploy prompter --no-verify-jwt`. |
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
  functions/prompter/  a página do exibidor do teleprompter
```

O laço de ferramentas roda **no seu navegador**: o Claude pede uma ação, o app executa
localmente sobre os seus dados e devolve o resultado. A função na nuvem é só um porteiro
para a chave da API.

O modelo é o `claude-opus-5`. A profundidade de raciocínio é ajustável em Ajustes →
Assistente — `low` para respostas rápidas e baratas, `xhigh` para análises pesadas.
