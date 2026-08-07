#!/usr/bin/env bash
# Measures what one feed actually costs the hub, so server sizing comes from
# numbers rather than guesses.
#
# Only the hub's own process tree is counted. The ffmpeg processes generating
# the test signal encode 1080p h264 and cost far more than anything the hub
# does — in production that work happens on the remote encoder, so counting it
# here would size the server several times too large.
#
# Usage: scripts/sizing.sh [base-url] [user] [pass] [bitrate-kbps]
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-demo-srt-2026}"
BITRATE="${4:-6000}"

TMP="$(mktemp -d)"
PIDS=()
IDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  for id in "${IDS[@]:-}"; do
    curl -fsS -b "$TMP/jar" -X DELETE "$BASE/api/ingests/$id" -o /dev/null 2>/dev/null || true
  done
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

SERVER_PID="$(pgrep -f 'server/dist/index.js' | head -1)"
[ -n "$SERVER_PID" ] || {
  echo "servidor não encontrado (esperado: node server/dist/index.js)" >&2
  exit 1
}

# Any pre-existing feed keeps its own relay, outputs and preview alive, and the
# tree measurement cannot tell them apart from the ones this script creates.
# Measuring against a dirty hub silently halves the per-signal figure.
EXISTING=$(curl -fsS -b "$TMP/jar" "$BASE/api/ingests" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
if [ "$EXISTING" != "0" ]; then
  echo "O hub já tem $EXISTING recepção(ões) configurada(s)." >&2
  echo "A medição precisa de um hub vazio — remova-as antes de rodar." >&2
  exit 1
fi

measure() {
  python3 scripts/measure-tree.py "$SERVER_PID"
}

run_case() {
  local label="$1" preview="$2" count="$3"
  IDS=()
  PIDS=()

  for i in $(seq 1 "$count"); do
    JSON=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
      -d "{\"name\":\"sizing-$i\",\"mode\":\"listener\",\"previewEnabled\":$preview}")
    ID=$(echo "$JSON" | jqv id)
    PORT=$(echo "$JSON" | jqv port)
    IDS+=("$ID")

    curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/outputs" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"out-a\",\"protocol\":\"srt\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 500)),\"mode\":\"caller\"}" \
      -o /dev/null
    curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/outputs" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"out-b\",\"protocol\":\"udp\",\"host\":\"127.0.0.1\",\"port\":$((PORT + 600))}" \
      -o /dev/null

    sleep 1
    ffmpeg -hide_banner -loglevel error -re \
      -f lavfi -i "testsrc2=size=1920x1080:rate=30" \
      -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
      -b:v "${BITRATE}k" -minrate "${BITRATE}k" -maxrate "${BITRATE}k" -bufsize "$((BITRATE / 2))k" \
      -t 110 -f mpegts "srt://127.0.0.1:${PORT}?mode=caller" >/dev/null 2>&1 &
    PIDS+=($!)
  done

  sleep 25
  RESULT=$(measure)
  CPU="${RESULT%%|*}"; REST="${RESULT#*|}"; MEM="${REST%%|*}"; PROCS="${REST##*|}"

  PER=$(python3 -c "print(f'{$CPU/$count:5.0f}%  {$MEM/$count:5.0f} MB')")
  printf '  %-24s  %5s%% CPU  %5s MB  %2s proc   por sinal: %s\n' \
    "$label" "$CPU" "$MEM" "$PROCS" "$PER"

  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  for id in "${IDS[@]}"; do
    curl -fsS -b "$TMP/jar" -X DELETE "$BASE/api/ingests/$id" -o /dev/null
  done
  IDS=(); PIDS=()
  sleep 6
}

echo "núcleos disponíveis: $(nproc)"
echo "medindo apenas a árvore do hub (pid $SERVER_PID)"
echo "fonte: 1080p30 a ${BITRATE} kbps · 2 saídas por sinal"
echo
echo "MEDIÇÃO"
run_case "3 sinais, sem preview" false 3
run_case "3 sinais, com preview" true 3
