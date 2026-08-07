#!/usr/bin/env bash
# Puts real signal through the hub, then screenshots the app with live data.
# A UI that renders an empty state proves very little.
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-admin-teste-123}"
OUT="${4:-./ui-shots-live}"

TMP="$(mktemp -d)"
PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf "$TMP"
}
trap cleanup EXIT

jqv() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    d = d[int(part)] if part.isdigit() else d[part]
print(d)
' "$1"
}

curl -fsS -c "$TMP/jar" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" -o /dev/null
echo "autenticado"

make_ingest() {
  local name="$1"
  curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"mode\":\"listener\",\"previewEnabled\":true}"
}

push() {
  local port="$1" bitrate="$2" secs="$3"
  ffmpeg -hide_banner -loglevel error -re \
    -f lavfi -i "testsrc2=size=1280x720:rate=30" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000" \
    -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
    -b:v "${bitrate}k" -minrate "${bitrate}k" -maxrate "${bitrate}k" -bufsize "$((bitrate / 2))k" \
    -c:a aac -b:a 128k -shortest -t "$secs" \
    -f mpegts "srt://127.0.0.1:${port}?mode=caller" >/dev/null 2>&1 &
  PIDS+=($!)
}

echo "=== criando recepções ==="
for spec in "Estádio — Câmera Principal:6000" "Externa SP — Unidade Móvel:4000" "Estúdio B:2500"; do
  NAME="${spec%:*}"; RATE="${spec##*:}"
  JSON=$(make_ingest "$NAME")
  ID=$(echo "$JSON" | jqv id)
  PORT=$(echo "$JSON" | jqv port)
  echo "  $NAME  porta $PORT  ${RATE}k"

  curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/outputs" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Master Control\",\"protocol\":\"srt\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 500)),\"mode\":\"caller\"}" \
    -o /dev/null
  curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/outputs" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Backup\",\"protocol\":\"udp\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 600))}" \
    -o /dev/null

  sleep 1
  push "$PORT" "$RATE" 200
done

echo "=== um destino pré-configurado ==="
curl -fsS -b "$TMP/jar" -X POST "$BASE/api/presets" -H 'Content-Type: application/json' \
  -d '{"name":"Canal Oficial","protocol":"rtmp","host":"rtmp://a.rtmp.youtube.com/live2/chave-secreta","locked":true}' \
  -o /dev/null

echo "=== uma solicitação de cadastro pendente ==="
curl -fsS -X POST "$BASE/api/signup" -H 'Content-Type: application/json' -d '{
  "firstName":"Marina","lastName":"Alves Costa","jobTitle":"Coordenadora de Transmissão",
  "phone":"21991234567","email":"marina.costa@exemplo.com.br"
}' -o /dev/null

echo "=== aguardando os sinais estabilizarem e o preview gerar ==="
sleep 30

curl -fsS -b "$TMP/jar" "$BASE/api/ingests" | python3 -c "
import json, sys
for i in json.load(sys.stdin):
    s = i['status'] or {}
    print('  %-30s %-10s %s kbps' % (i['name'], s.get('state'), s.get('bitrateKbps')))
"

echo "=== capturando a interface com dados reais ==="
node scripts/ui-check.mjs "$BASE" "$USER" "$PASS" "$OUT"
