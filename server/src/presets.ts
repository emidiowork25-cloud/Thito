import { nanoid } from 'nanoid';
import { db } from './db.js';
import type { OutputProtocol, SrtMode } from './types.js';

/**
 * A destination template the administrator defines once. Operators holding
 * `output.manage` can re-transmit to a preset without being handed raw
 * host/port control — which is the point of `locked`.
 */
export interface Preset {
  id: string;
  name: string;
  protocol: OutputProtocol;
  host: string;
  port: number | null;
  mode: SrtMode;
  streamId: string | null;
  passphrase: string | null;
  latencyUs: number;
  locked: boolean;
  createdAt: string;
}

interface PresetRow {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number | null;
  mode: string;
  stream_id: string | null;
  passphrase: string | null;
  latency_us: number;
  locked: number;
  created_at: string;
}

function toPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as OutputProtocol,
    host: row.host,
    port: row.port,
    mode: row.mode as SrtMode,
    streamId: row.stream_id,
    passphrase: row.passphrase,
    latencyUs: row.latency_us,
    locked: row.locked === 1,
    createdAt: row.created_at,
  };
}

export const presetRepo = {
  list(): Preset[] {
    const rows = db.prepare('SELECT * FROM presets ORDER BY name').all() as PresetRow[];
    return rows.map(toPreset);
  },

  get(id: string): Preset | null {
    const row = db.prepare('SELECT * FROM presets WHERE id = ?').get(id) as PresetRow | undefined;
    return row ? toPreset(row) : null;
  },

  create(input: Omit<Preset, 'id' | 'createdAt'>): Preset {
    const id = nanoid(10);
    db.prepare(
      `INSERT INTO presets
         (id, name, protocol, host, port, mode, stream_id, passphrase, latency_us, locked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.protocol,
      input.host,
      input.port,
      input.mode,
      input.streamId,
      input.passphrase,
      input.latencyUs,
      input.locked ? 1 : 0,
    );
    const created = this.get(id);
    if (!created) throw new Error('Preset disappeared immediately after insert');
    return created;
  },

  update(id: string, patch: Partial<Omit<Preset, 'id' | 'createdAt'>>): Preset | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    db.prepare(
      `UPDATE presets SET
         name = ?, protocol = ?, host = ?, port = ?, mode = ?,
         stream_id = ?, passphrase = ?, latency_us = ?, locked = ?
       WHERE id = ?`,
    ).run(
      next.name,
      next.protocol,
      next.host,
      next.port,
      next.mode,
      next.streamId,
      next.passphrase,
      next.latencyUs,
      next.locked ? 1 : 0,
      id,
    );
    return this.get(id);
  },

  remove(id: string): boolean {
    return db.prepare('DELETE FROM presets WHERE id = ?').run(id).changes > 0;
  },
};

/** Platform settings an administrator can change without redeploying. */
export interface PlatformSettings {
  siteName: string;
  /** Hostname advertised in connect URLs. Overrides THITO_PUBLIC_HOST when set. */
  publicHost: string | null;
  defaultLatencyMs: number;
  /** Whether operators may leave an SRT ingest unencrypted. */
  requirePassphrase: boolean;
}

const DEFAULTS: PlatformSettings = {
  siteName: 'SRT HUB FREE',
  publicHost: null,
  defaultLatencyMs: 120,
  requirePassphrase: false,
};

export const settingsRepo = {
  read(): PlatformSettings {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    const stored = new Map(rows.map((r) => [r.key, r.value]));

    const raw = stored.get('platform');
    if (!raw) return { ...DEFAULTS };
    try {
      const parsed = JSON.parse(raw) as Partial<PlatformSettings>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  },

  write(patch: Partial<PlatformSettings>): PlatformSettings {
    const next = { ...this.read(), ...patch };
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('platform', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(JSON.stringify(next));
    return next;
  },
};
