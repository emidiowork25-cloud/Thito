#!/usr/bin/env python3
"""Compares recorded traffic against what the test feed should have produced."""
import json
import sys

path, kbps, secs = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
d = json.load(open(path))

expected_mb = kbps * 1000 * secs / 8 / 1e6
recorded_mb = d["totalIn"] / 1e6

print("  esperado (aprox): %.1f MB de entrada" % expected_mb)
print("  registrado:       %.1f MB entrada / %.1f MB saida"
      % (recorded_mb, d["totalOut"] / 1e6))
print("  media entrada:    %.0f kbps" % (d["avgBpsIn"] / 1000))
print("  pico entrada:     %.0f kbps" % (d["peakBpsIn"] / 1000))
print()
for row in d["perIngest"]:
    print("  %-18s %7.1f MB entrada  %7.1f MB saida"
          % (row["name"], row["bytesIn"] / 1e6, row["bytesOut"] / 1e6))

ratio = recorded_mb / expected_mb if expected_mb else 0
print("\n  razao registrado/esperado: %.2f" % ratio)

# The feed is CBR video in an MPEG-TS wrapper, so the recorded figure runs a
# little above the video bitrate. A wide band still catches a broken recorder.
if not 0.75 <= ratio <= 1.35:
    print("  FALHOU: fora da faixa aceitavel")
    raise SystemExit(1)
print("  OK — dentro da margem esperada (overhead de TS + rampa inicial)")
