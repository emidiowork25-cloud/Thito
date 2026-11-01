import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashDeliveryToken } from '@/lib/server/delivery';
import { fail, fromError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Params = { params: { token: string } };

/** The courier marks the order handed over; the link dies with it. */
export async function POST(_req: Request, { params }: Params) {
  const pool = getPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE deliveries
       SET status = 'delivered', delivered_at = now()
       WHERE token_hash = $1 AND status IN ('pending', 'active')
       RETURNING id, order_id`,
      [hashDeliveryToken(params.token)]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail('Entrega não encontrada ou já encerrada', 404);
    }

    await client.query(
      `UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1`,
      [result.rows[0].order_id]
    );

    await client.query('COMMIT');
    return NextResponse.json({ completed: true });
  } catch (error: any) {
    await client?.query('ROLLBACK').catch(() => {});
    return fromError(error, 'Falha ao concluir entrega');
  } finally {
    client?.release();
  }
}
