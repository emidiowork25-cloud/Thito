#!/usr/bin/env bash
# Measures how much the browser preview writes to disk.
#
# The preview is the only part of the hub that writes continuously, and on a
# self-hosted box that number decides whether the storage survives a year of
# 24/7 operation. Reads write_bytes straight from /proc, so it counts what
# actually reaches the block layer rather than what the playlist holds.
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-demo-srt-2026}"
WINDOW="${4:-60}"

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
[ -n "$SERVER_PID" ] || { echo "servidor não encontrado" >&2; exit 1; }

JSON=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
  -d '{"name":"disk-wear","mode":"listener","previewEnabled":true}')
ID=$(echo "$JSON" | jqv id)
PORT=$(echo "$JSON" | jqv port)
IDS+=("$ID")

sleep 1
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
  -b:v 6000k -minrate 6000k -maxrate 6000k -bufsize 3000k \
  -c:a aac -b:a 128k -shortest -t $((WINDOW + 60)) \
  -f mpegts "srt://127.0.0.1:${PORT}?mode=caller" >/dev/null 2>&1 &
PIDS+=($!)

echo "aguardando o preview começar a gravar…"
sleep 25

python3 scripts/measure-writes.py "$SERVER_PID" "$WINDOW"
