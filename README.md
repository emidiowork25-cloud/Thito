# SRT HUB FREE

Hub de recepção e retransmissão de vídeo ao vivo. Recebe sinais **SRT**,
monitora em tempo real e reenvia para quantos destinos você precisar — em
**SRT, UDP, RTP, RTMP** ou **OMT (Open Media Transport)**.

Sem reencodar: o sinal que sai é o mesmo que entrou, exceto onde o formato de
destino exige conversão (RTMP e OMT).

```
                          ┌─────────────────────┐
  encoder remoto ──SRT──▶ │    SRT HUB FREE     │ ──▶ SRT   (contribuição)
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

## Subir com Docker

```sh
cd docker
THITO_PUBLIC_HOST=hub.suaempresa.com docker compose up -d --build
docker compose logs | grep -A3 "administrator created"
```

A senha do primeiro administrador é gerada e impressa **uma única vez** no log.
Não é recuperável — troque-a após o primeiro login.

`network_mode: host` é o padrão. SRT é UDP e o hub abre as portas de escuta
diretamente; publicar portas em modo bridge funciona, mas adiciona um salto de
NAT que atrapalha a medição de latência.

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

## Licença

MIT.
