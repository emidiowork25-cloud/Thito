import { nanoid } from 'nanoid';
import { userRepo } from './auth.js';
import { db } from './db.js';

export interface SignupRequest {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectNote: string | null;
  createdUserId: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  phone: string;
  email: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_note: string | null;
  created_user_id: string | null;
  created_at: string;
}

function toRequest(row: Row): SignupRequest {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    jobTitle: row.job_title,
    phone: row.phone,
    email: row.email,
    status: row.status as SignupRequest['status'],
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectNote: row.reject_note,
    createdUserId: row.created_user_id,
    createdAt: row.created_at,
  };
}

/** Digits only — the UI accepts "(11) 98765-4321" and we store 11987654321. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Strips accents and punctuation so "José da Silva" becomes "jose.silva".
 * Compound surnames keep only the final word, which is how people introduce
 * themselves and therefore what they will try to type at the login screen.
 */
function slugPart(value: string): string {
  return value
    .normalize('NFD')
    // Combining diacritics, written as escapes so the source stays ASCII.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function buildUsername(firstName: string, lastName: string): string {
  const first = slugPart(firstName.trim().split(/\s+/)[0] ?? '');
  const words = lastName.trim().split(/\s+/);
  const last = slugPart(words[words.length - 1] ?? '');
  const base = [first, last].filter(Boolean).join('.') || 'usuario';

  // Two people can share a name; the second one still needs to be able to log in.
  if (!userRepo.getByUsername(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}${n}`;
    if (!userRepo.getByUsername(candidate)) return candidate;
  }
  return `${base}.${nanoid(4).toLowerCase()}`;
}

/**
 * Initial password: the last four digits of the phone, as specified.
 *
 * This is a deliberately weak secret — four digits is 10,000 possibilities and
 * the phone number is often public. It is safe only because the account is
 * forced to change it at first login and logins are rate limited. Do not reuse
 * this scheme anywhere the forced change is not enforced.
 */
export function buildInitialPassword(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.slice(-4).padStart(4, '0');
}

export const signupRepo = {
  list(status?: SignupRequest['status']): SignupRequest[] {
    const rows = status
      ? (db
          .prepare('SELECT * FROM signup_requests WHERE status = ? ORDER BY created_at DESC')
          .all(status) as Row[])
      : (db.prepare('SELECT * FROM signup_requests ORDER BY created_at DESC').all() as Row[]);
    return rows.map(toRequest);
  },

  get(id: string): SignupRequest | null {
    const row = db.prepare('SELECT * FROM signup_requests WHERE id = ?').get(id) as Row | undefined;
    return row ? toRequest(row) : null;
  },

  countPending(): number {
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM signup_requests WHERE status = 'pending'")
      .get() as { n: number };
    return row.n;
  },

  /** A pending request for the same address blocks a duplicate submission. */
  pendingByEmail(email: string): SignupRequest | null {
    const row = db
      .prepare("SELECT * FROM signup_requests WHERE email = ? AND status = 'pending'")
      .get(email.toLowerCase()) as Row | undefined;
    return row ? toRequest(row) : null;
  },

  create(input: {
    firstName: string;
    lastName: string;
    jobTitle: string;
    phone: string;
    email: string;
  }): SignupRequest {
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO signup_requests (id, first_name, last_name, job_title, phone, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.firstName,
      input.lastName,
      input.jobTitle,
      normalizePhone(input.phone),
      input.email.toLowerCase(),
    );
    const created = this.get(id);
    if (!created) throw new Error('Signup request disappeared immediately after insert');
    return created;
  },

  markApproved(id: string, reviewerId: string, userId: string): void {
    db.prepare(
      `UPDATE signup_requests
       SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), created_user_id = ?
       WHERE id = ?`,
    ).run(reviewerId, userId, id);
  },

  markRejected(id: string, reviewerId: string, note: string | null): void {
    db.prepare(
      `UPDATE signup_requests
       SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), reject_note = ?
       WHERE id = ?`,
    ).run(reviewerId, note, id);
  },
};
