import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

const dataDir = resolve(process.env.THITO_DATA_DIR ?? './data');
mkdirSync(dataDir, { recursive: true });

export const config = {
  port: int('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',
  dataDir,
  dbPath: resolve(dataDir, 'thito.db'),
  previewDir: resolve(dataDir, 'preview'),

  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',

  /**
   * Hostname senders should use to reach this hub. Auto-detection behind NAT is
   * unreliable, so we ask for it explicitly and fall back to the request host.
   */
  publicHost: process.env.THITO_PUBLIC_HOST ?? null,

  /** Range the hub allocates SRT listener ports from. */
  srtPortMin: int('THITO_SRT_PORT_MIN', 9000),
  srtPortMax: int('THITO_SRT_PORT_MAX', 9099),

  /**
   * Loopback ports used for the internal fan-out bus. Each ingest reserves a
   * contiguous block of BUS_SLOTS ports starting at this base.
   */
  busPortBase: int('THITO_BUS_PORT_BASE', 21000),

  /**
   * Fan-out slots per ingest. Slot 0 is reserved for the HLS preview, so an
   * ingest supports BUS_SLOTS - 1 simultaneous outputs. Raising this costs one
   * extra loopback UDP copy per slot, which is cheap but not free.
   */
  busSlots: int('THITO_BUS_SLOTS', 9),

  /** Shared secret for the API. When unset the API is open — dev only. */
  adminToken: process.env.THITO_ADMIN_TOKEN ?? null,

  /** Restart backoff for supervised processes, in milliseconds. */
  restartMinDelayMs: int('THITO_RESTART_MIN_MS', 1_000),
  restartMaxDelayMs: int('THITO_RESTART_MAX_MS', 30_000),
} as const;

mkdirSync(config.previewDir, { recursive: true });
