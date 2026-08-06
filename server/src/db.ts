import Database from 'better-sqlite3';
import { config } from './config.js';
import type { Ingest, Output, OutputProtocol, SrtMode } from './types.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS ingests (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    mode            TEXT NOT NULL CHECK (mode IN ('listener','caller')),
    port            INTEGER NOT NULL,
    host            TEXT,
    stream_id       TEXT,
    passphrase      TEXT,
    latency_us      INTEGER NOT NULL DEFAULT 120000,
    preview_enabled INTEGER NOT NULL DEFAULT 1,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outputs (
    id          TEXT PRIMARY KEY,
    ingest_id   TEXT NOT NULL REFERENCES ingests(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    protocol    TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER,
    mode        TEXT NOT NULL DEFAULT 'caller' CHECK (mode IN ('listener','caller')),
    stream_id   TEXT,
    passphrase  TEXT,
    latency_us  INTEGER NOT NULL DEFAULT 120000,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS outputs_ingest_idx ON outputs(ingest_id);

  -- Listener ports must be unique across ingests or the second one silently
  -- fails to bind; enforce it in the schema rather than hoping the allocator
  -- always wins the race.
  CREATE UNIQUE INDEX IF NOT EXISTS ingests_listener_port_idx
    ON ingests(port) WHERE mode = 'listener';
`);

interface IngestRow {
  id: string;
  name: string;
  mode: string;
  port: number;
  host: string | null;
  stream_id: string | null;
  passphrase: string | null;
  latency_us: number;
  preview_enabled: number;
  enabled: number;
  created_at: string;
}

interface OutputRow {
  id: string;
  ingest_id: string;
  name: string;
  protocol: string;
  host: string;
  port: number | null;
  mode: string;
  stream_id: string | null;
  passphrase: string | null;
  latency_us: number;
  enabled: number;
  created_at: string;
}

function toIngest(row: IngestRow): Ingest {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode as SrtMode,
    port: row.port,
    host: row.host,
    streamId: row.stream_id,
    passphrase: row.passphrase,
    latencyUs: row.latency_us,
    previewEnabled: row.preview_enabled === 1,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

function toOutput(row: OutputRow): Output {
  return {
    id: row.id,
    ingestId: row.ingest_id,
    name: row.name,
    protocol: row.protocol as OutputProtocol,
    host: row.host,
    port: row.port,
    mode: row.mode as SrtMode,
    streamId: row.stream_id,
    passphrase: row.passphrase,
    latencyUs: row.latency_us,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

export const ingestRepo = {
  list(): Ingest[] {
    const rows = db
      .prepare('SELECT * FROM ingests ORDER BY created_at')
      .all() as IngestRow[];
    return rows.map(toIngest);
  },

  get(id: string): Ingest | null {
    const row = db.prepare('SELECT * FROM ingests WHERE id = ?').get(id) as
      | IngestRow
      | undefined;
    return row ? toIngest(row) : null;
  },

  usedListenerPorts(): number[] {
    const rows = db
      .prepare("SELECT port FROM ingests WHERE mode = 'listener'")
      .all() as { port: number }[];
    return rows.map((r) => r.port);
  },

  insert(i: Ingest): Ingest {
    db.prepare(
      `INSERT INTO ingests
         (id, name, mode, port, host, stream_id, passphrase, latency_us,
          preview_enabled, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      i.id,
      i.name,
      i.mode,
      i.port,
      i.host,
      i.streamId,
      i.passphrase,
      i.latencyUs,
      i.previewEnabled ? 1 : 0,
      i.enabled ? 1 : 0,
      i.createdAt,
    );
    return i;
  },

  update(id: string, patch: Partial<Ingest>): Ingest | null {
    const current = this.get(id);
    if (!current) return null;
    const next: Ingest = { ...current, ...patch, id, createdAt: current.createdAt };
    db.prepare(
      `UPDATE ingests SET
         name = ?, mode = ?, port = ?, host = ?, stream_id = ?, passphrase = ?,
         latency_us = ?, preview_enabled = ?, enabled = ?
       WHERE id = ?`,
    ).run(
      next.name,
      next.mode,
      next.port,
      next.host,
      next.streamId,
      next.passphrase,
      next.latencyUs,
      next.previewEnabled ? 1 : 0,
      next.enabled ? 1 : 0,
      id,
    );
    return next;
  },

  remove(id: string): boolean {
    return db.prepare('DELETE FROM ingests WHERE id = ?').run(id).changes > 0;
  },
};

export const outputRepo = {
  listByIngest(ingestId: string): Output[] {
    const rows = db
      .prepare('SELECT * FROM outputs WHERE ingest_id = ? ORDER BY created_at')
      .all(ingestId) as OutputRow[];
    return rows.map(toOutput);
  },

  listAll(): Output[] {
    const rows = db
      .prepare('SELECT * FROM outputs ORDER BY created_at')
      .all() as OutputRow[];
    return rows.map(toOutput);
  },

  get(id: string): Output | null {
    const row = db.prepare('SELECT * FROM outputs WHERE id = ?').get(id) as
      | OutputRow
      | undefined;
    return row ? toOutput(row) : null;
  },

  insert(o: Output): Output {
    db.prepare(
      `INSERT INTO outputs
         (id, ingest_id, name, protocol, host, port, mode, stream_id,
          passphrase, latency_us, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      o.id,
      o.ingestId,
      o.name,
      o.protocol,
      o.host,
      o.port,
      o.mode,
      o.streamId,
      o.passphrase,
      o.latencyUs,
      o.enabled ? 1 : 0,
      o.createdAt,
    );
    return o;
  },

  update(id: string, patch: Partial<Output>): Output | null {
    const current = this.get(id);
    if (!current) return null;
    const next: Output = {
      ...current,
      ...patch,
      id,
      ingestId: current.ingestId,
      createdAt: current.createdAt,
    };
    db.prepare(
      `UPDATE outputs SET
         name = ?, protocol = ?, host = ?, port = ?, mode = ?, stream_id = ?,
         passphrase = ?, latency_us = ?, enabled = ?
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
      next.enabled ? 1 : 0,
      id,
    );
    return next;
  },

  remove(id: string): boolean {
    return db.prepare('DELETE FROM outputs WHERE id = ?').run(id).changes > 0;
  },
};
