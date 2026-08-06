import { createSocket, type Socket } from 'node:dgram';

const WINDOW_MS = 1_000;

/**
 * Counts bytes arriving on one loopback bus slot.
 *
 * The ingest relay uses ffmpeg's `tee` muxer, and tee never reports
 * `total_size` back through `-progress` — so bitrate there is permanently
 * `N/A`. Rather than leave the most important number on the dashboard blank,
 * we subscribe to a reserved fan-out slot and measure the stream directly.
 *
 * Reading the wire also gives a truthful liveness signal: bytes arriving means
 * media is flowing, which ffmpeg's progress heartbeat alone does not prove.
 */
export class BitrateMeter {
  private socket: Socket | null = null;
  private bytes = 0;
  /** Never reset while the meter lives — the traffic recorder reads deltas. */
  private total = 0;
  private windowStart = Date.now();
  private kbps: number | null = null;
  private lastPacketAt = 0;

  constructor(private readonly port: number) {}

  start(): void {
    if (this.socket) return;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;

    socket.on('message', (msg) => {
      this.bytes += msg.length;
      this.total += msg.length;
      this.lastPacketAt = Date.now();
      this.roll();
    });

    // A meter must never take the hub down; a bind failure just means no
    // reading for this ingest.
    socket.on('error', () => this.stop());
    socket.bind(this.port, '127.0.0.1');
  }

  stop(): void {
    const socket = this.socket;
    this.socket = null;
    this.kbps = null;
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
  }

  /** Instantaneous bitrate in kbit/s, or null when nothing is arriving. */
  get bitrateKbps(): number | null {
    // Without this, a feed that stops shows its last reading forever.
    if (Date.now() - this.lastPacketAt > 3 * WINDOW_MS) return null;
    this.roll();
    return this.kbps;
  }

  /** True when packets arrived recently enough to call the feed live. */
  get flowing(): boolean {
    return Date.now() - this.lastPacketAt < 3 * WINDOW_MS;
  }

  /** Monotonic byte count since this meter was created. */
  get totalBytes(): number {
    return this.total;
  }

  private roll(): void {
    const now = Date.now();
    const elapsed = now - this.windowStart;
    if (elapsed < WINDOW_MS) return;
    this.kbps = Math.round((this.bytes * 8) / elapsed);
    this.bytes = 0;
    this.windowStart = now;
  }
}
