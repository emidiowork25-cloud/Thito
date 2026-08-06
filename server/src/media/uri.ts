import type { Ingest, Output } from '../types.js';

function query(params: Record<string, string | number | undefined | null>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

/**
 * SRT URL the hub itself passes to ffmpeg for an ingest.
 *
 * `mode=listener` binds locally, so the host part must be a bind address and
 * not the public hostname — using the public name here breaks inside NAT and
 * inside containers.
 */
export function ingestInputUrl(ingest: Ingest): string {
  if (ingest.mode === 'listener') {
    return `srt://0.0.0.0:${ingest.port}${query({
      mode: 'listener',
      latency: ingest.latencyUs,
      passphrase: ingest.passphrase,
      streamid: ingest.streamId,
    })}`;
  }
  return `srt://${ingest.host}:${ingest.port}${query({
    mode: 'caller',
    latency: ingest.latencyUs,
    passphrase: ingest.passphrase,
    streamid: ingest.streamId,
  })}`;
}

/**
 * The URL to hand to whoever is sending into this ingest. Only meaningful in
 * listener mode — in caller mode the hub is the one dialling out.
 */
export function ingestConnectUrl(ingest: Ingest, publicHost: string): string | null {
  if (ingest.mode !== 'listener') return null;
  return `srt://${publicHost}:${ingest.port}${query({
    mode: 'caller',
    latency: ingest.latencyUs,
    passphrase: ingest.passphrase,
    streamid: ingest.streamId,
  })}`;
}

/** Destination URL for an output leg. `omtMuxer` is null on builds without OMT. */
export function outputUrl(output: Output): string {
  switch (output.protocol) {
    case 'srt': {
      const hostPart =
        output.mode === 'listener' ? '0.0.0.0' : output.host;
      return `srt://${hostPart}:${output.port}${query({
        mode: output.mode,
        latency: output.latencyUs,
        passphrase: output.passphrase,
        streamid: output.streamId,
      })}`;
    }
    case 'udp':
      // pkt_size keeps each datagram at 7 TS packets, the MPEG-TS-over-UDP norm.
      return `udp://${output.host}:${output.port}?pkt_size=1316`;
    case 'rtp':
      return `rtp://${output.host}:${output.port}`;
    case 'rtmp':
      // The stream key travels in the path, so host carries the full URL tail.
      return output.host.startsWith('rtmp')
        ? output.host
        : `rtmp://${output.host}${output.port ? `:${output.port}` : ''}`;
    case 'omt':
      // OMT addresses senders by name over mDNS discovery, not host:port.
      return output.host;
  }
}

/** Loopback bus address for a fan-out slot. */
export function busUrl(port: number, forReading: boolean): string {
  return forReading
    ? `udp://127.0.0.1:${port}?fifo_size=1000000&overrun_nonfatal=1`
    : `udp://127.0.0.1:${port}?pkt_size=1316`;
}
