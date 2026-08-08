#!/usr/bin/env bash
# Proves the stream key does what a stream key must do:
#   1. a sender holding it connects
#   2. a sender without it is refused
#   3. rotating issues a new one and kills the old immediately
#
# Anything less and calling it a key would be decoration.
set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"
USER="${2:-admin}"
PASS="${3:-demo-srt-2026}"

TMP="$(mktemp -d)"
ID=""
cleanup() {
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

fail=0
try_send() {
  local port="$1" key="$2" label="$3" expect="$4"
  local opts=""
  [ -n "$key" ] && opts="&passphrase=${key}"

  # The source must outlive the check. Sampling after it ends reads as a
  # rejection even when the connection was accepted — which is exactly the
  # false negative this test produced before.
  timeout 30 ffmpeg -hide_banner -loglevel error -re \
    -f lavfi -i testsrc2=size=320x180:rate=25 \
    -c:v libx264 -preset ultrafast -t 25 \
    -f mpegts "srt://127.0.0.1:${port}?mode=caller${opts}" >/dev/null 2>&1 &
  local pid=$!
  sleep 9

  local state
  state=$(curl -fsS -b "$TMP/jar" "$BASE/api/ingests/$ID" | jqv status.state)
  kill "$pid" 2>/dev/null

  local got
  [ "$state" = "running" ] && got="ACEITOU" || got="REJEITOU"
  local mark
  if [ "$got" = "$expect" ]; then mark=" ok"; else mark=" !!"; fail=1; fi
  printf '%s  %-46s %-9s (esperado %s)\n' "$mark" "$label" "$got" "$expect"

  # Let the relay settle back to waiting before the next attempt.
  sleep 4
}

curl -fsS -c "$TMP/jar" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" -o /dev/null

JSON=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests" -H 'Content-Type: application/json' \
  -d '{"name":"teste-de-chave","mode":"listener","previewEnabled":false}')
ID=$(echo "$JSON" | jqv id)
PORT=$(echo "$JSON" | jqv port)
KEY=$(echo "$JSON" | jqv connect.streamKey)

echo "recepção criada na porta $PORT"
echo "chave gerada automaticamente: $KEY"
echo
[ -n "$KEY" ] || { echo "FALHOU: nenhuma chave foi gerada" >&2; exit 1; }

echo "A CHAVE VALE ALGUMA COISA?"
try_send "$PORT" "$KEY" "com a chave correta"        ACEITOU
try_send "$PORT" ""     "sem chave nenhuma"          REJEITOU
try_send "$PORT" "chave-errada-qualquer-123" "com chave errada" REJEITOU

echo
echo "ROTAÇÃO INVALIDA A ANTIGA?"
OLD="$KEY"
NEW=$(curl -fsS -b "$TMP/jar" -X POST "$BASE/api/ingests/$ID/rotate-key" | jqv connect.streamKey)
echo "  chave nova: $NEW"
[ "$NEW" != "$OLD" ] || { echo "FALHOU: a rotação devolveu a mesma chave" >&2; exit 1; }
sleep 4

try_send "$PORT" "$OLD" "com a chave antiga"  REJEITOU
try_send "$PORT" "$NEW" "com a chave nova"    ACEITOU

echo
if [ "$fail" = "0" ]; then
  echo "TODOS OS CASOS PASSARAM"
else
  echo "HOUVE FALHAS" >&2
  exit 1
fi
