import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { fail, unauthorized, fromError } from '@/lib/server/http';

export async function GET(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();

  try {
    const result = await getPool().query(
      'SELECT id, email, name, user_type FROM users WHERE id = $1',
      [auth.userId]
    );

    const user = result.rows[0];
    if (!user) return fail('Usuário não encontrado', 404);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.user_type,
    });
  } catch (error: any) {
    return fromError(error, 'Falha ao buscar usuário');
  }
}
