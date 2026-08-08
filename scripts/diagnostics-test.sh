#!/usr/bin/env bash
# Puts a feed through a lossy link and checks that the platform explains what is
# wrong, with numbers, and says what to do about it.
#
# A diagnostic that only fires in theory is worse than none — it will be trusted
# and it will be silent. This forces the condition and reads the answer back.
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-demo-srt-2026}"
LOSS="${4:-8}"

TMP="$(mktemp -d)"
PIDS=()
ID=""
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  [ -n "$ID" ] && curl -fsS -b "$TMP/jar" -X DELETE "$BASE/api/ingests/$ID" -o /dev/null 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

jqv() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    d = d[int(part)] if part.isdigit() else d[part]
print(d if d is not None else "")
' "$1"
}

show() {
  curl -fsS -b "$TMP/jar" "$BASE/api/ingests/$ID" | python3 -c '
import json, sys
d = json.load(sys.stdin)
s = d["status"] or {}
print("  estado=%s  bitrate=%s kbps" % (s.get("state"), s.get("bitrateKbps")))
diags = s.get("diagnostics") or []
if not diags:
    print("  (nenhum diagnóstico)")
for item in diags:
    print()
    print("  [%s] %s" % (item["severity"].upper(), item["title"]))
    if item["advice"]:
        print("        -> %s" % item["advice"])
'
}

curl -fsS -c "$TMP/jar" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" -o /dev/null

# Declare the encoder's bitrate so a shortfall is measured against intent.
JSON=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
  -d '{"name":"diagnostico","mode":"listener","previewEnabled":false,"unprotected":true,"nominalKbps":4000}')
ID=$(echo "$JSON" | jqv id)
PORT=$(echo "$JSON" | jqv port)

echo "recepção na porta $PORT · encoder declarado em 4000 kbps · perda simulada de ${LOSS}%"
echo

node scripts/lossy-udp.mjs 19990 "$PORT" "$LOSS" > "$TMP/proxy.log" 2>&1 &
PIDS+=($!)
sleep 1

ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=1280x720:rate=30" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 30 \
  -b:v 4000k -minrate 4000k -maxrate 4000k -bufsize 2000k \
  -t 90 -f mpegts "srt://127.0.0.1:19990?mode=caller&latency=120000" >/dev/null 2>&1 &
PIDS+=($!)

echo "=== 15 s depois ==="
sleep 15
show

echo
echo "=== 45 s depois ==="
sleep 30
show

echo
echo "=== o proxy confirma a perda ==="
tail -2 "$TMP/proxy.log"
