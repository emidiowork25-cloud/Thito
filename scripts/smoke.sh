#!/usr/bin/env bash
# End-to-end smoke test: pushes a generated SRT feed into a live hub, adds a
# UDP output, and verifies packets actually come out the far side.
#
# Usage: scripts/smoke.sh [base-url]   (default http://127.0.0.1:8080)
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
TMP="$(mktemp -d)"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf "$TMP"
}
trap cleanup EXIT

say() { printf '\n=== %s ===\n' "$1"; }
fail() { printf '\nFAIL: %s\n' "$1" >&2; exit 1; }

say "hub capabilities"
curl -fsS "$BASE/api/system" | tee "$TMP/system.json"
grep -q '"srt":true' "$TMP/system.json" || fail "ffmpeg has no SRT support"

say "create ingest"
curl -fsS -X POST "$BASE/api/ingests" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke","mode":"listener","previewEnabled":true}' > "$TMP/ingest.json"
cat "$TMP/ingest.json"

INGEST_ID=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$TMP/ingest.json" | head -1)
PORT=$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$TMP/ingest.json" | head -1)
[ -n "$INGEST_ID" ] && [ -n "$PORT" ] || fail "could not parse ingest id/port"
echo "ingest=$INGEST_ID port=$PORT"

# Give the listener a moment to bind before dialling it.
sleep 2

say "push a test feed into the ingest"
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=640x360:rate=25" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 25 -b:v 1200k \
  -c:a aac -b:a 96k -shortest -t 40 \
  -f mpegts "srt://127.0.0.1:${PORT}?mode=caller&latency=120000" &
PIDS+=($!)

say "wait for the relay to report media"
for _ in $(seq 1 20); do
  sleep 1
  curl -fsS "$BASE/api/ingests/$INGEST_ID" > "$TMP/status.json"
  grep -q '"state":"running"' "$TMP/status.json" && break
done
grep -q '"state":"running"' "$TMP/status.json" || {
  cat "$TMP/status.json"; curl -fsS "$BASE/api/ingests/$INGEST_ID/logs"; fail "ingest never reached running"
}
echo "ingest is running"
sed -n 's/.*"bitrateKbps":\([0-9]*\).*/bitrate=\1 kbps/p' "$TMP/status.json" | head -1

say "add a UDP output and capture it"
curl -fsS -X POST "$BASE/api/ingests/$INGEST_ID/outputs" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-udp","protocol":"udp","host":"127.0.0.1","port":19876}' > "$TMP/output.json"
cat "$TMP/output.json"

ffmpeg -hide_banner -loglevel error -y \
  -i "udp://127.0.0.1:19876?timeout=15000000&fifo_size=1000000" \
  -t 5 -c copy "$TMP/captured.ts" 2>"$TMP/capture.log" || true

if [ -s "$TMP/captured.ts" ]; then
  echo "captured $(stat -c%s "$TMP/captured.ts") bytes from the UDP output"
else
  cat "$TMP/capture.log"
  curl -fsS "$BASE/api/ingests/$INGEST_ID/logs"
  fail "no data arrived on the UDP output"
fi

say "check the browser preview playlist"
for _ in $(seq 1 20); do
  sleep 1
  if curl -fsS "$BASE/preview/$INGEST_ID/index.m3u8" -o "$TMP/index.m3u8" 2>/dev/null; then break; fi
done
if [ -s "$TMP/index.m3u8" ]; then
  head -8 "$TMP/index.m3u8"
else
  fail "HLS preview playlist never appeared"
fi

say "tear down"
curl -fsS -X DELETE "$BASE/api/ingests/$INGEST_ID" -o /dev/null -w 'delete status: %{http_code}\n'

printf '\nALL CHECKS PASSED\n'
