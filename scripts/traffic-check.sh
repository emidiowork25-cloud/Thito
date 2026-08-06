#!/usr/bin/env bash
# Pushes a known-bitrate feed through the hub and verifies the recorded traffic
# matches it. The recorder flushes once a minute, so this runs long enough to
# cross at least one flush boundary.
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
ADMIN_USER="${2:-admin}"
ADMIN_PASS="${3:-admin-teste-123}"
BITRATE_KBPS=3000
SECONDS_TO_RUN=95

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; kill ${FFPID:-0} 2>/dev/null || true' EXIT

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
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" -o /dev/null

echo "=== criando recepção ==="
ID=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
  -d '{"name":"traffic-check","mode":"listener","previewEnabled":false}' | jqv id)
PORT=$(curl -fsS -b "$TMP/jar" "$BASE/api/ingests/$ID" | jqv port)
echo "  ingest=$ID porta=$PORT"

curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/outputs" -H 'Content-Type: application/json' \
  -d '{"name":"saida","protocol":"udp","host":"127.0.0.1","port":19950}' -o /dev/null
echo "  saída UDP adicionada"

sleep 2
echo "=== enviando ${BITRATE_KBPS} kbps por ${SECONDS_TO_RUN}s ==="
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=1280x720:rate=30" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
  -b:v ${BITRATE_KBPS}k -minrate ${BITRATE_KBPS}k -maxrate ${BITRATE_KBPS}k -bufsize 1500k \
  -t $SECONDS_TO_RUN -f mpegts "srt://127.0.0.1:${PORT}?mode=caller" >/dev/null 2>&1 &
FFPID=$!

for i in $(seq 1 $((SECONDS_TO_RUN / 15))); do
  sleep 15
  printf '  %3ds  ' $((i * 15))
  curl -fsS -b "$TMP/jar" "$BASE/api/ingests/$ID" | python3 -c "
import json, sys
s = json.load(sys.stdin)['status']
print('estado=%-10s bitrate=%s kbps' % (s['state'], s['bitrateKbps']))
"
done

wait $FFPID 2>/dev/null || true
echo "=== aguardando o flush do registrador ==="
sleep 65

echo "=== tráfego registrado ==="
curl -fsS -b "$TMP/jar" "$BASE/api/traffic?bucket=hour" -o "$TMP/traffic.json"
python3 scripts/traffic-report.py "$TMP/traffic.json" "$BITRATE_KBPS" "$SECONDS_TO_RUN"
