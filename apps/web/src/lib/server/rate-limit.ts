import { getPool } from './db';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Vercel's edge overwrites x-forwarded-for on the way in, so the left-most
 * entry is the real client and cannot be spoofed by the caller. Without that
 * guarantee this header would be attacker-controlled and useless as a key.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Counts one hit against `key` and reports whether it is still under `limit`
 * for the window. The counter lives in Postgres because serverless instances
 * share no memory — an in-process counter would reset on every cold start and
 * be trivially bypassed by spreading requests across instances.
 *
 * Fails open: every caller of this needs the database for its actual work, so
 * a database outage already fails the request on its own.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const result = await getPool().query(
      'SELECT hits, resets_at FROM hit_rate_limit($1, $2)',
      [key, windowSeconds]
    );

    const { hits, resets_at: resetsAt } = result.rows[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(resetsAt).getTime() - Date.now()) / 1000)
    );

    return { allowed: hits <= limit, retryAfterSeconds };
  } catch (error: any) {
    console.error('Rate limiter unavailable:', error.message);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Budgets, tuned so a real customer never notices and a script always does. */
export const LIMITS = {
  login: { limit: 8, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 3600 },
  createOrder: { limit: 20, windowSeconds: 300 },
  upload: { limit: 30, windowSeconds: 3600 },
  write: { limit: 60, windowSeconds: 300 },
} as const;
