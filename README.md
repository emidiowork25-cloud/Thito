# THITO — seu hub pessoal, com o JARBAS dentro

Um único lugar para tudo que é seu: agenda, finanças, listas de compras, mapas mentais
para estudo, atas de reunião e apresentações. Por cima de tudo isso mora o **JARBAS** —
um assistente que enxerga seus dados, conversa por voz e age por você.

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

O hub inteiro funciona sem isso. Mas o JARBAS só pensa depois deste passo — é a única
coisa que falta, e ela é sua porque envolve a sua chave de API.

O projeto na nuvem **já está criado e configurado** (banco, políticas de segurança e a
função do assistente já estão no ar, e o app já vem apontando para ele). Falta apenas
guardar a sua chave da Anthropic lá dentro:

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

### Criar sua conta (sincronizar entre dispositivos)

Abra **Ajustes → Nuvem e sincronização → Criar conta**, com e-mail e senha.
Use a mesma conta em outro computador e os dados aparecem lá. Uma política de segurança
no banco garante que cada conta só enxerga as próprias linhas.

Sem conta, tudo continua funcionando — só fica guardado apenas neste PC.

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

As seções conversam entre si: a lista de compras vira lançamento, a reunião vira pendência,
o mapa mental vira apresentação.

---

## Atalhos

| Tecla | Ação |
|---|---|
| `Ctrl + K` | Busca em tudo + paleta de comandos |
| `Ctrl + J` | Abrir/fechar o JARBAS |
| `Ctrl + Espaço` | Segurar para falar |
| `1` a `8` | Pular direto para uma seção |
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
  core/       db (IndexedDB), store (cache + regras), sync, supabase, settings, bus, util
  ui/         shell (rotas, paleta, navegação), components (modal, formulário, toast)
  views/      as 8 telas
  assistant/  jarbas (conversa), voice (fala e escuta), context (retrato dos dados),
              tools (o que ele pode fazer), orb (o visual reativo)
styles/       base (tokens e casca), views (cada tela)
supabase/
  functions/jarbas/    a função que guarda a chave e chama o Claude
```

O laço de ferramentas roda **no seu navegador**: o Claude pede uma ação, o app executa
localmente sobre os seus dados e devolve o resultado. A função na nuvem é só um porteiro
para a chave da API.

O modelo é o `claude-opus-5`. A profundidade de raciocínio é ajustável em Ajustes →
Assistente — `low` para respostas rápidas e baratas, `xhigh` para análises pesadas.
