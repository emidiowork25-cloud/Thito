import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { updateOrderStatusSchema } from '@/lib/server/validation';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

type Params = { params: { orderId: string } };

export async function PATCH(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  try {
    const parsed = updateOrderStatusSchema.parse(await req.json());
    const pool = getPool();

    const orderResult = await pool.query(
      `SELECT o.id FROM orders o
       JOIN stores s ON o.store_id = s.id
       WHERE o.id = $1 AND s.user_id = $2`,
      [params.orderId, auth.userId]
    );

    if (orderResult.rows.length === 0) return fail('Pedido não encontrado', 404);

    const result = await pool.query(
      `UPDATE orders
       SET status = $1,
           estimated_time_minutes = COALESCE($2, estimated_time_minutes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, status, estimated_time_minutes AS "estimatedTimeMinutes",
                 updated_at AS "updatedAt"`,
      [parsed.status, parsed.estimatedTime ?? null, params.orderId]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    return fromError(error, 'Falha ao atualizar status');
  }
}
