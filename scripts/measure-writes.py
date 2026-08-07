#!/usr/bin/env python3
"""Reports the disk write rate of a process tree, projected out to a year.

Used by scripts/disk-wear.sh to answer whether the browser preview will chew
through the storage of a self-hosted box.
"""
import subprocess
import sys
import time


def descendants(root: int) -> set[int]:
    out = subprocess.run(["ps", "-eo", "pid,ppid"], capture_output=True, text=True).stdout
    children: dict[int, list[int]] = {}
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        children.setdefault(int(parts[1]), []).append(int(parts[0]))

    seen: set[int] = set()
    stack = [root]
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        stack.extend(children.get(current, []))
    return seen


def written_bytes(pids: set[int]) -> int:
    """
    write_bytes from /proc counts what was actually sent to the block layer,
    which is the figure that wears storage out. The playlist size on disk stays
    small because old segments are deleted — it says nothing about total writes.
    """
    total = 0
    for pid in pids:
        try:
            with open(f"/proc/{pid}/io", encoding="utf-8") as fh:
                for line in fh:
                    if line.startswith("write_bytes:"):
                        total += int(line.split()[1])
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
    return total


def main() -> None:
    root = int(sys.argv[1])
    window = int(sys.argv[2]) if len(sys.argv) > 2 else 60

    pids = descendants(root)
    start = written_bytes(pids)
    print(f"medindo por {window}s ({len(pids)} processos)…")
    time.sleep(window)

    # Re-read the tree: ffmpeg may have restarted, and a pid that vanished takes
    # its counter with it, which would read as negative growth.
    pids = descendants(root) | pids
    end = written_bytes(pids)

    delta = max(0, end - start)
    per_sec = delta / window
    per_day = per_sec * 86_400
    per_year = per_day * 365

    print()
    print(f"  escrita        {per_sec / 1e3:8.0f} kB/s")
    print(f"  por dia        {per_day / 1e9:8.1f} GB")
    print(f"  por ano        {per_year / 1e12:8.1f} TB")
    print()
    print("  projeção com 1 preview ativo. Multiplique pelo número de previews.")
    print("  Um SSD de consumo suporta tipicamente 100–600 TBW.")


if __name__ == "__main__":
    main()
