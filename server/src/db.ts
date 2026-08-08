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

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin','operator')),
    -- scrypt digest, stored as salt:hash
    password_hash TEXT NOT NULL,
    -- JSON array of permission keys; ignored for admins, who hold all of them
    permissions   TEXT NOT NULL DEFAULT '[]',
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

  -- Which ingests a non-admin may see at all. Absence of a row means the
  -- ingest is invisible to that user, not merely read-only.
  CREATE TABLE IF NOT EXISTS ingest_access (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingest_id TEXT NOT NULL REFERENCES ingests(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, ingest_id)
  );

  -- Admin-defined destination templates, so operators can re-transmit to a
  -- vetted endpoint without being handed raw host/port control.
  CREATE TABLE IF NOT EXISTS presets (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    protocol   TEXT NOT NULL,
    host       TEXT NOT NULL,
    port       INTEGER,
    mode       TEXT NOT NULL DEFAULT 'caller',
    stream_id  TEXT,
    passphrase TEXT,
    latency_us INTEGER NOT NULL DEFAULT 120000,
    -- When set, operators may use this preset but not edit its parameters.
    locked     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Self-service signups wait here until an administrator decides. No user row
  -- exists until approval, so a pending request can never authenticate.
  CREATE TABLE IF NOT EXISTS signup_requests (
    id           TEXT PRIMARY KEY,
    first_name   TEXT NOT NULL,
    last_name    TEXT NOT NULL,
    job_title    TEXT NOT NULL,
    phone        TEXT NOT NULL,
    email        TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
    reviewed_by  TEXT,
    reviewed_at  TEXT,
    reject_note  TEXT,
    created_user_id TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS signup_status_idx ON signup_requests(status, created_at);

  -- Every outbound message is persisted before any delivery attempt. Without
  -- this an SMTP outage silently loses the credentials mail and the account
  -- becomes unreachable with no record of why.
  CREATE TABLE IF NOT EXISTS mail_outbox (
    id          TEXT PRIMARY KEY,
    to_address  TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body_text   TEXT NOT NULL,
    body_html   TEXT NOT NULL,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sent','failed')),
    error       TEXT,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at     TEXT
  );

  CREATE INDEX IF NOT EXISTS mail_status_idx ON mail_outbox(status, created_at);

  -- One row per ingest per minute. Aggregated on read into hour/day/week/month;
  -- storing pre-rolled buckets instead would lock the reporting periods to
  -- whatever was decided here.
  CREATE TABLE IF NOT EXISTS traffic_minutes (
    ingest_id  TEXT NOT NULL,
    minute_ts  INTEGER NOT NULL,
    bytes_in   INTEGER NOT NULL DEFAULT 0,
    bytes_out  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ingest_id, minute_ts)
  );

  CREATE INDEX IF NOT EXISTS traffic_ts_idx ON traffic_minutes(minute_ts);
`);

/**
 * Adds a column when an older database predates it. SQLite has no
 * ADD COLUMN IF NOT EXISTS, and blindly running it throws on second boot.
 */
function addColumn(table: string, column: string, definition: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('ingests', 'nominal_kbps', 'INTEGER');
addColumn('users', 'email', 'TEXT');
addColumn('users', 'phone', 'TEXT');
addColumn('users', 'job_title', 'TEXT');
// Credentials handed out by an administrator are provisional by definition.
addColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');

interface IngestRow {
  id: string;
  name: string;
  mode: string;
  port: number;
  host: string | null;
  stream_id: string | null;
  passphrase: string | null;
  latency_us: number;
  nominal_kbps: number | null;
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
    nominalKbps: row.nominal_kbps,
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
          nominal_kbps, preview_enabled, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      i.id,
      i.name,
      i.mode,
      i.port,
      i.host,
      i.streamId,
      i.passphrase,
      i.latencyUs,
      i.nominalKbps,
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
         latency_us = ?, nominal_kbps = ?, preview_enabled = ?, enabled = ?
       WHERE id = ?`,
    ).run(
      next.name,
      next.mode,
      next.port,
      next.host,
      next.streamId,
      next.passphrase,
      next.latencyUs,
      next.nominalKbps,
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
