#!/usr/bin/env python3
"""Reports CPU%, RSS and process count for one process and all its descendants.

Used by scripts/sizing.sh to measure the hub without counting the test
generators running beside it.
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


def memory_kb(pid: int) -> float:
    """
    Proportional set size, not RSS.

    Every ffmpeg maps the same shared libraries, so summing RSS across twenty of
    them counts libavcodec twenty times and reports several times the memory
    actually in use. PSS divides each shared page by the number of processes
    sharing it, which is the number that answers "how much RAM do I need".
    """
    try:
        with open(f"/proc/{pid}/smaps_rollup", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("Pss:"):
                    return float(line.split()[1])
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        pass
    # smaps_rollup needs a recent kernel and permission; fall back to RSS and
    # accept the overcount rather than reporting nothing.
    try:
        with open(f"/proc/{pid}/statm", encoding="utf-8") as fh:
            return float(fh.read().split()[1]) * 4  # pages -> kB
    except (FileNotFoundError, ProcessLookupError):
        return 0.0


def snapshot(root: int) -> tuple[float, float, int]:
    pids = descendants(root)
    out = subprocess.run(["ps", "-eo", "pid,pcpu"], capture_output=True, text=True).stdout
    cpu = 0.0
    count = 0
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2 or int(parts[0]) not in pids:
            continue
        cpu += float(parts[1])
        count += 1
    mem_kb = sum(memory_kb(pid) for pid in pids)
    return cpu, mem_kb / 1024, count


def main() -> None:
    root = int(sys.argv[1])
    # ps reports CPU averaged over each process's lifetime, so a freshly spawned
    # ffmpeg reads high. Take a spaced second sample once the average settles.
    snapshot(root)
    time.sleep(12)
    cpu, mb, procs = snapshot(root)
    print(f"{cpu:.0f}|{mb:.0f}|{procs}")


if __name__ == "__main__":
    main()
