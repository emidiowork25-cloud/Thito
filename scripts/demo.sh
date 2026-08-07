#!/usr/bin/env bash
# Populates a running hub with demo feeds and keeps live signal flowing, so the
# interface can be explored with real pictures and real numbers instead of
# empty states.
#
#   Terminal 1:  npm run dev
#   Terminal 2:  scripts/demo.sh
#
# Ctrl+C stops the generated signal. The feeds stay configured.
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-}"
MINUTES="${4:-30}"

if [ -z "$PASS" ]; then
  cat >&2 <<'EOF'
Informe a senha do administrador:

  scripts/demo.sh http://127.0.0.1:8080 admin SUA_SENHA

Na primeira execução do servidor ela é gerada e impressa uma única vez no log,
numa linha "First run — administrator created". Para definir uma você mesmo,
suba o servidor com THITO_ADMIN_PASSWORD=... antes do primeiro boot.
EOF
  exit 1
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg não encontrado no PATH" >&2; exit 1; }

JAR="$(mktemp)"
PIDS=()
cleanup() {
  echo
  echo "encerrando os sinais de teste…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  rm -f "$JAR"
}
trap cleanup EXIT INT TERM

jqv() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    d = d[int(part)] if part.isdigit() else d[part]
print(d)
' "$1"
}

curl -fsS -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" -o /dev/null \
  || { echo "login falhou — confira usuário e senha" >&2; exit 1; }
echo "autenticado em $BASE"

SECONDS_TO_RUN=$((MINUTES * 60))

# name:bitrate — three feeds of different weights so the dashboard has shape.
FEEDS=(
  "Estádio — Câmera Principal:6000"
  "Externa SP — Unidade Móvel:4000"
  "Estúdio B:2500"
)

echo
echo "criando recepções e ligando os sinais…"
for spec in "${FEEDS[@]}"; do
  NAME="${spec%:*}"
  RATE="${spec##*:}"

  JSON=$(curl -fsS -b "$JAR" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$NAME\",\"mode\":\"listener\",\"previewEnabled\":true}")
  ID=$(echo "$JSON" | jqv id)
  PORT=$(echo "$JSON" | jqv port)

  # Two outputs each: one SRT leg and one UDP leg, both to loopback. Nothing
  # listens on the far side, which is deliberate — it shows the retry behaviour.
  curl -fsS -b "$JAR" -X POST "$BASE/api/ingests/$ID/outputs" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Master Control\",\"protocol\":\"srt\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 500)),\"mode\":\"caller\"}" \
    -o /dev/null
  curl -fsS -b "$JAR" -X POST "$BASE/api/ingests/$ID/outputs" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Backup\",\"protocol\":\"udp\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 600))}" \
    -o /dev/null

  sleep 1
  ffmpeg -hide_banner -loglevel error -re \
    -f lavfi -i "testsrc2=size=1280x720:rate=30" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000" \
    -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
    -b:v "${RATE}k" -minrate "${RATE}k" -maxrate "${RATE}k" -bufsize "$((RATE / 2))k" \
    -c:a aac -b:a 128k -shortest -t "$SECONDS_TO_RUN" \
    -f mpegts "srt://127.0.0.1:${PORT}?mode=caller" >/dev/null 2>&1 &
  PIDS+=($!)

  printf '  %-32s porta %s  %s kbps\n' "$NAME" "$PORT" "$RATE"
done

echo
echo "cadastrando um destino pré-configurado…"
curl -fsS -b "$JAR" -X POST "$BASE/api/presets" -H 'Content-Type: application/json' \
  -d '{"name":"Canal Oficial","protocol":"rtmp","host":"rtmp://a.rtmp.youtube.com/live2/chave-de-exemplo","locked":true}' \
  -o /dev/null

echo "deixando uma solicitação de acesso pendente…"
curl -fsS -X POST "$BASE/api/signup" -H 'Content-Type: application/json' -d '{
  "firstName":"Marina","lastName":"Alves Costa","jobTitle":"Coordenadora de Transmissão",
  "phone":"21991234567","email":"marina.costa@exemplo.com.br"
}' -o /dev/null

echo
echo "aguardando os sinais estabilizarem…"
sleep 20

curl -fsS -b "$JAR" "$BASE/api/ingests" | python3 -c "
import json, sys
print()
for i in json.load(sys.stdin):
    s = i['status'] or {}
    print('  %-32s %-11s %s kbps' % (i['name'], s.get('state', '?'), s.get('bitrateKbps', '—')))
"

cat <<EOF

Pronto. Abra $BASE e entre como "$USER".

  Recepções   três sinais ao vivo com preview
  Multiview   a grade completa
  Banda       enche à medida que o tráfego é gravado, um ponto por minuto
  Aprovações  uma solicitação da Marina esperando análise

Os sinais rodam por $MINUTES minutos. Ctrl+C encerra.
EOF

wait
