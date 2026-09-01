import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getPool } from '@/lib/server/db';
import { generateToken } from '@/lib/server/auth';
import { loginSchema } from '@/lib/server/validation';
import { fail, fromError } from '@/lib/server/http';

export async function POST(req: Request) {
  try {
    const parsed = loginSchema.parse(await req.json());

    const result = await getPool().query(
      'SELECT id, email, password_hash, user_type, name FROM users WHERE email = $1',
      [parsed.email]
    );

    const user = result.rows[0];
    if (!user) {
      return fail('Credenciais inválidas', 401);
    }

    const isPasswordValid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!isPasswordValid) {
      return fail('Credenciais inválidas', 401);
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
