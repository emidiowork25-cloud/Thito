import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/server/db';
import { generateToken } from '@/lib/server/auth';
import { registerSchema } from '@/lib/server/validation';
import { clientIp, rateLimit, LIMITS } from '@/lib/server/rate-limit';
import { fail, tooManyRequests, fromError } from '@/lib/server/http';

// Work factor for new passwords. Existing hashes carry their own cost inside
// the hash string, so raising this does not invalidate them.
const BCRYPT_ROUNDS = 12;

export async function POST(req: Request) {
  const pool = getPool();
  let client;

  try {
    const body = await req.json();
    const parsed = registerSchema.parse(body);

    const ip = clientIp(req);
    const { allowed, retryAfterSeconds } = await rateLimit(
      `register:ip:${ip}`,
      LIMITS.register.limit,
      LIMITS.register.windowSeconds
    );
    if (!allowed) return tooManyRequests(retryAfterSeconds);

    const hashedPassword = await bcrypt.hash(parsed.password, BCRYPT_ROUNDS);

    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO users (email, password_hash, user_type, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, user_type, name`,
      [parsed.email, hashedPassword, parsed.userType, parsed.name]
    );

    const user = result.rows[0];

    // A store account is useless without its store row, so the two are
    // created together or not at all.
    if (parsed.userType === 'store') {
      await client.query('INSERT INTO stores (user_id, name) VALUES ($1, $2)', [
        user.id,
        parsed.name,
      ]);
    }

    await client.query('COMMIT');

    const token = generateToken({
      userId: user.id,
      userType: user.user_type,
      email: user.email,
    });

    return NextResponse.json(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        userType: user.user_type,
        token,
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client?.query('ROLLBACK').catch(() => {});

    // This does confirm the address is taken, which is a disclosure. The
    // alternative — a generic reply plus a confirmation email — needs mail
    // infrastructure this app does not have, so the rate limit above is what
    // keeps it from being usable for bulk enumeration.
    if (error.code === '23505') {
      return fail('Este e-mail já está cadastrado', 409);
    }
    return fromError(error, 'Falha no cadastro');
  } finally {
    client?.release();
  }
}
