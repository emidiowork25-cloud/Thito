# Enabling Open Media Transport (OMT)

The default image ships Debian's ffmpeg, which has SRT but **not** OMT. Thito
detects this at boot (`GET /api/system` → `capabilities.omtMuxer`) and disables
OMT outputs in the UI rather than failing at stream time.

## Why it needs a custom build

OMT is a 2025 protocol from the [Open Media Transport
project](https://github.com/openmediatransport) — MIT-licensed, and positioned
as an open alternative to NDI. FFmpeg support currently lives in the
[GalleryUK/FFmpeg-OMT](https://github.com/GalleryUK/FFmpeg-OMT) fork; the
upstream patches are still in review, so no distro ships it yet.

## Scope warning, read this before designing around it

OMT is a **LAN protocol**. It relies on mDNS discovery and carries lightly
compressed VMX video at bitrates meant for gigabit ethernet — hundreds of Mbit/s
for HD, not the few Mbit/s SRT uses. It is not a wide-area contribution
transport and will not survive the public internet.

The sensible topology is therefore:

```
remote site ──SRT over internet──▶ Thito ──OMT over LAN──▶ vMix / OBS / switcher
```

SRT for the long haul, OMT for the last hop inside the facility. Thito's output
model is built around exactly that split.

## Build outline

1. Fetch the prebuilt OMT libraries and headers from
   [GalleryUK/OMTLibsAndHeaders](https://github.com/GalleryUK/OMTLibsAndHeaders)
   and install them where the linker can find them (`/usr/local/lib`,
   `/usr/local/include`).
2. Clone the fork and configure it with OMT and SRT both enabled:

   ```sh
   ./configure --enable-gpl --enable-libx264 --enable-libsrt --enable-libomt
   make -j"$(nproc)" && make install
   ```

3. Point Thito at the binary:

   ```sh
   FFMPEG_PATH=/usr/local/bin/ffmpeg
   ```

4. Restart the hub and confirm the probe picks it up:

   ```sh
   curl -s localhost:8080/api/system | grep omt
   ```

Thito probes for several muxer spellings (`libomt`, `omt`, and the `_output`
variants) because the name has not settled across the fork and the upstream PR.
If your build exposes a different name, add it to `OMT_NAMES` in
`server/src/media/capabilities.ts`.

**These build steps are not exercised by this repository's CI.** They follow the
fork's documented configure flags, but the OMT toolchain moves quickly — treat
the outline as a starting point and check the upstream README if configure
rejects a flag.

## Once it works

An OMT output takes a sender **name**, not a host and port — receivers find it
over mDNS discovery on the local network. Enter that name in the output's host
field (for example `THITO (Programa)`).

Unlike every other output in Thito, OMT is **not** a passthrough: the leg
decodes the incoming stream and re-encodes it to VMX. Budget CPU accordingly —
one OMT output costs far more than one SRT output.
