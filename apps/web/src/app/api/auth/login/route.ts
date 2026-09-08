import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/server/db';
import { generateToken } from '@/lib/server/auth';
import { loginSchema } from '@/lib/server/validation';
import { clientIp, rateLimit, LIMITS } from '@/lib/server/rate-limit';
import { fail, tooManyRequests, fromError } from '@/lib/server/http';

/*
 * A real bcrypt hash of a random string, compared against when no account
 * matches. Skipping the comparison would return "no such user" in a fraction
 * of the time a wrong password takes, and that timing gap alone is enough to
 * enumerate which emails are registered.
 */
const DECOY_HASH = '$2b$10$EWTnOTdCMR83/71vcmu9DOChAdxVn5CP9SfgRTY2IMIerRc6fsX6m';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.parse(body);

    // Limited per IP and per account: the IP budget stops one host spraying
    // many accounts, the account budget stops a botnet spread across many
    // hosts converging on one.
    const ip = clientIp(req);
    for (const key of [`login:ip:${ip}`, `login:email:${parsed.email}`]) {
      const { allowed, retryAfterSeconds } = await rateLimit(
        key,
        LIMITS.login.limit,
        LIMITS.login.windowSeconds
      );
      if (!allowed) return tooManyRequests(retryAfterSeconds);
    }

    const result = await getPool().query(
      'SELECT id, email, password_hash, user_type, name FROM users WHERE email = $1',
      [parsed.email]
    );

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(
      parsed.password,
      user?.password_hash ?? DECOY_HASH
    );

    // One message for both failure modes: saying which half was wrong tells
    // an attacker when they have found a live account.
    if (!user || !isPasswordValid) {
      return fail('E-mail ou senha incorretos', 401);
    }

    const token = generateToken({
      userId: user.id,
      userType: user.user_type,
      email: user.email,
    });

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      userType: user.user_type,
      token,
    });
  } catch (error: any) {
    return fromError(error, 'Falha no login');
  }
}
