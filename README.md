# SRT HUB EASY

Hub de recepção e retransmissão de vídeo ao vivo. Recebe sinais **SRT**,
monitora em tempo real e reenvia para quantos destinos você precisar — em
**SRT, UDP, RTP, RTMP** ou **OMT (Open Media Transport)**.

Sem reencodar: o sinal que sai é o mesmo que entrou, exceto onde o formato de
destino exige conversão (RTMP e OMT).

```
                          ┌─────────────────────┐
  encoder remoto ──SRT──▶ │    SRT HUB EASY     │ ──▶ SRT   (contribuição)
                          │                     │ ──▶ UDP   (rede local)
                          │  monitor + preview  │ ──▶ RTMP  (plataformas)
                          └─────────────────────┘ ──▶ OMT   (switcher na LAN)
```

## Como funciona por dentro

Cada recepção roda um processo de relay que copia o sinal para um **barramento
local** de slots UDP em loopback. Cada saída lê o seu próprio slot, no seu
próprio processo.

Isso não é detalhe de implementação — é a diferença entre um hub e um script:
adicionar, remover ou perder uma saída **nunca** perturba a recepção nem as
saídas vizinhas. Um destino que caiu reconecta sozinho, com backoff, enquanto o
resto continua no ar.

Dois slots são reservados: um alimenta o preview HLS do navegador, outro o
medidor de bitrate.

### Por que o bitrate é medido no fio

O muxer `tee` do ffmpeg nunca reporta `total_size`, então `-progress` devolve
`bitrate=N/A` para sempre no relay. Em vez de deixar em branco o número mais
importante do painel, o hub abre um socket UDP num slot reservado e mede o
stream diretamente.

Nas saídas o bitrate vem do ffmpeg, mas calculado por **delta** de bytes — o
campo `bitrate` nativo é média acumulada desde o início, que num sinal ao vivo
atrasa minutos atrás da realidade.

## Usuários e permissões

Dois eixos independentes:

- **Permissão** — o que o usuário pode fazer
- **Acesso** — em quais recepções ele pode fazer

Ter `output.manage` não deixa um operador retransmitir um sinal que nunca lhe
foi liberado; deixa retransmitir os que foram.

| Permissão          | O que libera                        |
| ------------------ | ----------------------------------- |
| `ingest.create`    | Criar uma nova recepção             |
| `ingest.configure` | Configurar, iniciar, parar, remover |
| `ingest.monitor`   | Monitorar e ver logs                |
| `output.manage`    | Retransmitir com novos parâmetros   |
| `output.omt`       | Transmitir por OMT                  |
| `ingest.viewAll`   | Ver todo o tráfego (multiview)      |

O administrador tem todas implicitamente, mais gestão de usuários, destinos
pré-configurados e configurações da plataforma.

Recepções fora do escopo respondem **404**, não 403 — um operador não deve
conseguir sondar a existência de sinais que não lhe pertencem. O preview HLS
passa pela mesma checagem: é vídeo de verdade, e sem isso seria um buraco
aberto contornando a API.

## Colocar para rodar

### O mínimo, na sua máquina

```sh
npm install
node scripts/fetch-fonts.mjs     # baixa as fontes para dentro do repositório
npm run build
THITO_ADMIN_PASSWORD=uma-senha-forte npm start
```

Abra `http://localhost:8080`. Requer **Node 20+** e **ffmpeg com libsrt**
(`ffmpeg -protocols | grep srt`); no Debian e no Ubuntu o pacote padrão já vem
com ele.

Para ver a interface povoada, com sinal ao vivo e preview funcionando:

```sh
scripts/demo.sh http://localhost:8080 admin uma-senha-forte
```

Cria três recepções, liga sinal de teste em cada uma, cadastra um destino e
deixa uma solicitação de acesso pendente. Ctrl+C encerra os sinais.

### Em um servidor, com Docker

```sh
cd docker
THITO_PUBLIC_HOST=hub.suaempresa.com \
THITO_ADMIN_PASSWORD=uma-senha-forte \
docker compose up -d --build
```

### O que é obrigatório

| Item | Por quê |
| ---- | ------- |
| **`THITO_PUBLIC_HOST`** | É o host que aparece no link entregue ao encoder. A detecção automática usa o cabeçalho `Host`, que atrás de NAT quase sempre mente. |
| **UDP liberado na faixa 9000–9099** | SRT é UDP. Sem isso o encoder nunca conecta, e o sintoma no painel é uma recepção presa em "conectando". |
| **`network_mode: host` ou publicar o range UDP** | Publicar porta a porta em modo bridge funciona, mas adiciona um salto de NAT. |
| **Senha do administrador** | Sem `THITO_ADMIN_PASSWORD` uma é gerada e impressa **uma única vez** no log do primeiro boot. Se você perder, não há recuperação — só apagar o banco. |

### O que é opcional

- **HTTPS.** Funciona sem, mas com TLS o cookie de sessão passa a ser `secure`.
  Atrás de um proxy reverso, encaminhe `X-Forwarded-Proto` — o servidor confia
  nesse cabeçalho para decidir.
- **SMTP.** Sem ele a plataforma funciona: os e-mails ficam na fila e as
  credenciais aparecem para o administrador na tela de aprovação.
- **OMT.** Exige um build próprio do ffmpeg. Sem ele as saídas OMT ficam
  desabilitadas na interface.

### Dimensionamento do servidor

Medido neste repositório com `scripts/sizing.sh`, contra sinais de **1080p30 a
6 Mb/s com duas saídas cada**, contando apenas a árvore de processos do hub:

| Por sinal | CPU | Memória |
| --------- | --- | ------- |
| Só repasse (preview desligado) | ~9% de um núcleo | ~100 MB |
| Com preview no navegador | ~30% de um núcleo | ~188 MB |

O preview custa **mais de três vezes** o resto junto, porque é a única parte que
transcodifica. Desligá-lo nos sinais que ninguém está olhando é o ajuste de
maior efeito que existe aqui.

Extrapolando para dez sinais simultâneos:

| Cenário | vCPU | RAM | Rede |
| ------- | ---- | --- | ---- |
| 10 sinais, sem preview | 2 | 4 GB | ~180 Mb/s |
| 10 sinais, todos com preview | 4 | 8 GB | ~180 Mb/s |

A conta de rede costuma apertar antes da de CPU: cada sinal de 6 Mb/s com duas
saídas move 18 Mb/s. Confira o limite de tráfego mensal do provedor antes do
número de núcleos.

Para medir na sua própria carga, com o hub vazio:

```sh
scripts/sizing.sh http://localhost:8080 admin sua-senha 6000
```

### Rodando em máquina própria

Funciona, mas o gargalo muda de lugar: numa VPS o limite costuma ser CPU, em
casa é quase sempre a internet.

**Hardware.** Quatro núcleos e 8 GB dão conta de dez sinais. Qualquer mini PC ou
desktop dos últimos anos serve. Duas exigências que não são negociáveis:

- **SSD, nunca cartão SD.** Medido com `scripts/disk-wear.sh`: cada preview
  ativo escreve ~**11,8 GB por dia** (4,3 TB por ano). Dez previews chegam a
  43 TB/ano — dentro do que um SSD de consumo aguenta (100–600 TBW), e muito
  além do que um cartão SD sobrevive. Num Raspberry Pi com SD, ligue os previews
  só quando for olhar.
- **Nobreak.** É o que separa "servidor" de "computador ligado".

**Rede.** Aqui mora o problema real:

- **Upload, não download.** Cada saída multiplica. Um sinal de 6 Mb/s com três
  destinos consome 18 Mb/s de subida. Links residenciais brasileiros são
  assimétricos — 300 Mb/s de descida com 100 de subida é comum, e é a subida que
  conta.
- **IP público sem CGNAT.** Se a operadora usa CGNAT, conexões de entrada não
  chegam e o modo listener simplesmente não funciona. Peça IP público (costuma
  ser plano empresarial) ou opere só em modo caller, com o hub buscando os
  sinais.
- **Redirecionamento de portas** UDP 9000–9099 e TCP 443 para a máquina.
- **IP fixo ou DDNS**, alimentando `THITO_PUBLIC_HOST`.

Quantos sinais cabem na sua subida:

| Upload disponível | Sinais de 6 Mb/s com 2 saídas |
| ----------------- | ----------------------------- |
| 35 Mb/s | 2 |
| 100 Mb/s | 5 |
| 300 Mb/s | 16 |
| 1 Gb/s | 55 |

Deixe folga de 30%: SRT retransmite pacotes perdidos, e um link saturado entra
em espiral — perde, retransmite, satura mais.

### Onde aperta primeiro

Na ordem em que costuma doer:

1. **Upload da internet.** Multiplica por saída e é o teto mais baixo.
2. **CGNAT.** Não é gradual: ou você tem IP público, ou o modo listener não
   existe para você.
3. **Preview.** Mais de 3× o custo de CPU do resto. Desligue nos sinais que
   ninguém está olhando.
4. **Disco, se for cartão SD.** Ver acima.
5. **CPU.** Só depois de tudo isso, e apenas com muitos previews ou saídas OMT,
   que reencodam.
6. **RAM.** Praticamente nunca é o limite.

### Escolhendo o provedor

O critério aqui não é CPU nem RAM — os dois são baratos e fáceis de acertar. É
**franquia de tráfego de saída**, que multiplica pelo número de destinos e cujo
preço por terabyte varia em duas ordens de grandeza entre provedores.

```sh
scripts/traffic.py 5 6 2 8     # 5 sinais, 6 Mb/s cada, 2 saídas, 8 h/dia
```

Três perguntas, nesta ordem:

1. **Quanto de saída por mês?** Rode o comando acima com os seus números.
2. **Quanto custa o TB acima da franquia?** É onde a conta explode. Vale de
   US$ 1 a US$ 150 por TB dependendo do provedor — e o mesmo tráfego custa
   150× mais em um do que em outro.
3. **A latência importa para a sua operação?** SRT absorve distância com o
   buffer de latência: 250 ms cobrem uma travessia até a América do Norte. Se o
   sinal só vai de A para B, distância custa pouco. Se há retorno ou
   comunicação com quem está em campo, cada salto pesa.

Tráfego em datacenters brasileiros custa de 5 a 10 vezes mais que na Europa ou
nos Estados Unidos, e as franquias são bem menores. Vale a pena pagar por isso
quando a latência é requisito de operação — não por padrão.

### Duas instâncias no mesmo servidor

Cada instância aloca portas SRT a partir de 9000 e portas de barramento a partir
de 21000. Rodando duas com o padrão, elas colidem. Dê faixas diferentes à
segunda:

```sh
THITO_SRT_PORT_MIN=9100 THITO_SRT_PORT_MAX=9199 THITO_BUS_PORT_BASE=22000
```

## Desenvolvimento

```sh
npm install
npm run dev          # API em :8080, interface em :5173
```

Requer **ffmpeg com libsrt**. O build do Debian/Ubuntu já vem com ele:

```sh
ffmpeg -protocols | grep srt
```

### Teste ponta a ponta

```sh
npm run dev
scripts/smoke.sh
```

Gera um sinal de teste, injeta por SRT, cria uma saída UDP, captura o que sai do
outro lado e confere o preview HLS.

## Configuração

| Variável                             | Padrão      | Para quê                                     |
| ------------------------------------ | ----------- | -------------------------------------------- |
| `PORT`                               | `8080`      | Porta HTTP                                   |
| `THITO_PUBLIC_HOST`                  | —           | Host anunciado nos links de envio            |
| `THITO_SRT_PORT_MIN` / `_MAX`        | `9000/9099` | Faixa de portas de recepção                  |
| `THITO_BUS_SLOTS`                    | `9`         | Saídas por recepção = slots − 2               |
| `THITO_DATA_DIR`                     | `./data`    | Banco SQLite e segmentos de preview          |
| `THITO_ADMIN_USER` / `_PASSWORD`     | —           | Semeia o primeiro admin em vez de gerar senha |
| `FFMPEG_PATH`                        | `ffmpeg`    | Binário alternativo (necessário para OMT)     |

Atrás de NAT, **defina `THITO_PUBLIC_HOST`**. A detecção automática usa o
cabeçalho `Host` da requisição, que quase sempre mente nesse cenário.

## Sobre o OMT

OMT é um protocolo aberto (MIT, 2025) posicionado como alternativa ao NDI. Duas
coisas importam antes de desenhar sua operação em cima dele:

**É protocolo de LAN.** Usa descoberta mDNS e carrega vídeo VMX a centenas de
Mb/s. Não atravessa a internet pública. A topologia que funciona é SRT no trecho
longo, OMT no último salto dentro da casa.

**O suporte no ffmpeg ainda vive num fork.** Nenhuma distribuição empacota. Por
isso o hub detecta a capacidade na inicialização e desabilita saídas OMT na
interface quando ausente, em vez de falhar na hora do ar.

Para habilitar, veja [`docker/ffmpeg-omt.md`](docker/ffmpeg-omt.md).


## Página pública e acesso administrativo

A raiz (`/`) é uma página de venda: o que a plataforma faz, prints do produto
em funcionamento, e duas portas — **entrar** e **criar conta**.

O acesso administrativo **não aparece nela**. Fica em `/admin`, um endereço
próprio que só quem precisa conhece.

Isso não é segurança por obscuridade — a autenticação é a mesma e um operador
que descubra o endereço continua sem conseguir nada além do que suas permissões
permitem. É higiene de produto: a página pública fala com quem vai usar a
plataforma, e um botão de administrador ali só gera cliques de gente que não
tem o que fazer do outro lado.

Fontes: **Barlow Condensed** nos títulos, rótulos, botões e números;
**Montserrat** no restante da interface, com texto corrido em Medium.

## Cadastro e aprovação de usuários

A página inicial oferece três portas: entrar, entrar como administrador e
solicitar acesso. O cadastro é público e pede nome, sobrenome, função, celular
com DDD e e-mail.

```
usuário envia ──▶ e-mail "em análise"
                        │
              administrador aprova ──▶ e-mail com link, usuário e senha
                        │
              primeiro login ──▶ troca de senha obrigatória
```

Nenhum registro de usuário existe antes da aprovação — uma solicitação pendente
não consegue autenticar de forma alguma.

### Credenciais iniciais

Conforme especificado, o usuário vem de `nome.sobrenome` e a senha são os
**4 últimos dígitos do celular**.

Isso são 10.000 combinações contra um número que costuma ser conhecido. Duas
proteções sustentam o esquema e **nenhuma das duas é opcional**:

- a conta nasce marcada como provisória e não alcança nada além do endpoint de
  troca de senha até trocá-la;
- o login é limitado a 8 tentativas por endereço a cada 10 minutos.

Se você remover qualquer uma delas, troque também a senha inicial.

### E-mail

```sh
SMTP_HOST=smtp.suaempresa.com
SMTP_PORT=587
SMTP_USER=no-reply@suaempresa.com
SMTP_PASS=...
SMTP_FROM="SRT HUB EASY <no-reply@suaempresa.com>"
THITO_PUBLIC_URL=https://hub.suaempresa.com
```

Toda mensagem é gravada em uma caixa de saída **antes** de qualquer tentativa de
envio. Se o SMTP falhar na hora da aprovação, as credenciais continuam legíveis
para o administrador em `/api/mail` e o envio é retentado a cada minuto. O
caminho inverso — gravar só depois de enviar — destruiria uma credencial que não
existe em nenhum outro lugar.

Sem `SMTP_HOST` a plataforma funciona normalmente: os e-mails ficam na fila e o
administrador repassa as credenciais manualmente.

Para testar sem um servidor real:

```sh
node scripts/smtp-sink.mjs 2525 ./smtp-out    # em um terminal
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 npm run dev
scripts/signup-flow.sh
```

## Dashboard de banda

O tráfego é gravado como uma linha por recepção por minuto e agregado na
leitura em hora, dia, semana e mês. Guardar baldes pré-agregados congelaria os
períodos de relatório no que foi decidido na hora da escrita.

O escopo vale aqui também: o operador vê o consumo apenas das recepções que
recebeu; o administrador vê a plataforma inteira.

```sh
scripts/traffic-check.sh   # injeta 3000 kbps e confere o que foi contabilizado
```

## Licença

MIT.
