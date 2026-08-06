import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import {
  isPermission,
  type Permission,
  type Role,
  type User,
} from './permissions.js';

const SCRYPT_KEYLEN = 64;
/** Sessions last a week; long shifts should not log an operator out mid-event. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'thito_session';

// ------------------------------------------------------------------ passwords

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would leak through the error path.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ----------------------------------------------------------------- user store

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: string;
  password_hash: string;
  permissions: string;
  enabled: number;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
}

function toUser(row: UserRow): User {
  let permissions: Permission[] = [];
  try {
    const parsed: unknown = JSON.parse(row.permissions);
    if (Array.isArray(parsed)) {
      permissions = parsed.filter((p): p is Permission => typeof p === 'string' && isPermission(p));
    }
  } catch {
    // A corrupt row must not grant access; fall back to none.
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role as Role,
    permissions,
    enabled: row.enabled === 1,
    email: row.email,
    phone: row.phone,
    jobTitle: row.job_title,
    mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export const userRepo = {
  list(): User[] {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
    return rows.map(toUser);
  },

  get(id: string): User | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? toUser(row) : null;
  },

  getByUsername(username: string): (User & { passwordHash: string }) | null {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | UserRow
      | undefined;
    return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
  },

  count(): number {
    const row = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    return row.n;
  },

  countAdmins(excludingId?: string): number {
    const row = excludingId
      ? (db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND enabled = 1 AND id != ?")
          .get(excludingId) as { n: number })
      : (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND enabled = 1").get() as {
          n: number;
        });
    return row.n;
  },

  create(input: {
    username: string;
    displayName: string;
    password: string;
    role: Role;
    permissions: Permission[];
  }): User {
    const id = nanoid(10);
    db.prepare(
      `INSERT INTO users (id, username, display_name, role, password_hash, permissions, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      id,
      input.username,
      input.displayName,
      input.role,
      hashPassword(input.password),
      JSON.stringify(input.permissions),
    );
    const created = this.get(id);
    if (!created) throw new Error('User disappeared immediately after insert');
    return created;
  },

  update(
    id: string,
    patch: Partial<{
      username: string;
      displayName: string;
      role: Role;
      permissions: Permission[];
      enabled: boolean;
      password: string;
      email: string | null;
      phone: string | null;
      jobTitle: string | null;
      mustChangePassword: boolean;
    }>,
  ): User | null {
    const current = this.get(id);
    if (!current) return null;

    if (patch.username !== undefined) {
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(patch.username, id);
    }
    if (patch.displayName !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(patch.displayName, id);
    }
    if (patch.email !== undefined) {
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(patch.email, id);
    }
    if (patch.phone !== undefined) {
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(patch.phone, id);
    }
    if (patch.jobTitle !== undefined) {
      db.prepare('UPDATE users SET job_title = ? WHERE id = ?').run(patch.jobTitle, id);
    }
    if (patch.mustChangePassword !== undefined) {
      db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?').run(
        patch.mustChangePassword ? 1 : 0,
        id,
      );
    }
    if (patch.role !== undefined) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
    }
    if (patch.permissions !== undefined) {
      db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(
        JSON.stringify(patch.permissions),
        id,
      );
    }
    if (patch.enabled !== undefined) {
      db.prepare('UPDATE users SET enabled = ? WHERE id = ?').run(patch.enabled ? 1 : 0, id);
      // A disabled account must lose its live sessions, not just future logins.
      if (!patch.enabled) sessionRepo.removeForUser(id);
    }
    if (patch.password !== undefined) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(patch.password),
        id,
      );
      sessionRepo.removeForUser(id);
    }
    return this.get(id);
  },

  remove(id: string): boolean {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
  },

  markLogin(id: string): void {
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
  },
};

// -------------------------------------------------------------------- sessions

export const sessionRepo = {
  create(userId: string): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).run(token, userId, now, expiresAt);
    return { token, expiresAt };
  },

  resolve(token: string): User | null {
    const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as
      | { user_id: string; expires_at: number }
      | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.remove(token);
      return null;
    }
    const user = userRepo.get(row.user_id);
    if (!user || !user.enabled) return null;
    return user;
  },

  remove(token: string): void {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },

  removeForUser(userId: string): void {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  purgeExpired(): void {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  },
};

// ----------------------------------------------------------------- ingest ACL

export const accessRepo = {
  /** Ingest ids a user may see. Admins are not routed through here. */
  listForUser(userId: string): string[] {
    const rows = db
      .prepare('SELECT ingest_id FROM ingest_access WHERE user_id = ?')
      .all(userId) as { ingest_id: string }[];
    return rows.map((r) => r.ingest_id);
  },

  listUsersForIngest(ingestId: string): string[] {
    const rows = db
      .prepare('SELECT user_id FROM ingest_access WHERE ingest_id = ?')
      .all(ingestId) as { user_id: string }[];
    return rows.map((r) => r.user_id);
  },

  set(userId: string, ingestIds: string[]): void {
    const clear = db.prepare('DELETE FROM ingest_access WHERE user_id = ?');
    const insert = db.prepare(
      'INSERT OR IGNORE INTO ingest_access (user_id, ingest_id) VALUES (?, ?)',
    );
    db.transaction(() => {
      clear.run(userId);
      for (const ingestId of ingestIds) insert.run(userId, ingestId);
    })();
  },

  grant(userId: string, ingestId: string): void {
    db.prepare('INSERT OR IGNORE INTO ingest_access (user_id, ingest_id) VALUES (?, ?)').run(
      userId,
      ingestId,
    );
  },

  has(userId: string, ingestId: string): boolean {
    const row = db
      .prepare('SELECT 1 AS ok FROM ingest_access WHERE user_id = ? AND ingest_id = ?')
      .get(userId, ingestId) as { ok: number } | undefined;
    return row !== undefined;
  },
};

/**
 * Seeds the first administrator so a fresh install is reachable.
 *
 * The generated password is printed once and never stored in clear — an
 * install that logs a fixed default is an install that ships a backdoor.
 */
export function ensureBootstrapAdmin(): { username: string; password: string } | null {
  if (userRepo.count() > 0) return null;

  const username = process.env.THITO_ADMIN_USER ?? 'admin';
  const password = process.env.THITO_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url');

  userRepo.create({
    username,
    displayName: 'Administrador',
    password,
    role: 'admin',
    permissions: [],
  });

  return { username, password };
}
