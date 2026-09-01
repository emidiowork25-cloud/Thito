import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/server/db';
import { generateToken } from '@/lib/server/auth';
import { registerSchema } from '@/lib/server/validation';
import { fail, fromError } from '@/lib/server/http';

export async function POST(req: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const parsed = registerSchema.parse(await req.json());
    const hashedPassword = await bcrypt.hash(parsed.password, 10);

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
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      return fail('Email já cadastrado', 400);
    }
    return fromError(error, 'Falha no cadastro');
  } finally {
    client.release();
  }
}
