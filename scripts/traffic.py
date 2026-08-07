#!/usr/bin/env python3
"""Estimates monthly egress, which is what decides the VPS bill.

CPU and RAM are easy to satisfy and cheap to add. Outbound traffic is neither:
it multiplies by output count, and the price per terabyte above the included
allowance varies by two orders of magnitude between providers.

Usage: scripts/traffic.py [feeds] [mbps-per-feed] [outputs-per-feed] [hours-per-day]
"""
import sys


def main() -> None:
    feeds = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    mbps = float(sys.argv[2]) if len(sys.argv) > 2 else 6
    outputs = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    hours = float(sys.argv[4]) if len(sys.argv) > 4 else 8

    out_mbps = feeds * outputs * mbps
    in_mbps = feeds * mbps
    tb = out_mbps * 1e6 * hours * 3600 * 30 / 8 / 1e12

    print(f"  {feeds} sinais x {mbps:g} Mb/s x {outputs} saidas, {hours:g} h/dia")
    print()
    print(f"  entrada          {in_mbps:8.0f} Mb/s")
    print(f"  saida            {out_mbps:8.0f} Mb/s   <- e o que o provedor cobra")
    print(f"  saida por mes    {tb:8.1f} TB")
    print()
    print("  Franquia necessaria, com 30% de folga:", f"{tb * 1.3:.0f} TB/mes")
    print()
    print("  Custo do excedente, por TB acima da franquia:")
    for name, usd_per_gb in [
        ("Hetzner", 0.001),
        ("Contabo (reduz a velocidade, nao cobra)", 0.0),
        ("DigitalOcean / Vultr", 0.01),
        ("Vultr Sao Paulo", 0.03),
        ("AWS Sao Paulo", 0.15),
    ]:
        print(f"    {name:<42} US$ {usd_per_gb * 1000:>7.2f} / TB")


if __name__ == "__main__":
    main()
