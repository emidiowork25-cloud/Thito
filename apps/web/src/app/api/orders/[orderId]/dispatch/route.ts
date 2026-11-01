import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { dispatchDeliverySchema } from '@/lib/server/validation';
import { generateDeliveryToken } from '@/lib/server/delivery';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

type Params = { params: { orderId: string } };

/**
 * The store hands an order to a courier. Returns a one-time link; the token
 * itself is never stored, only its hash, so this response is the single
 * moment the link exists in readable form.
 */
export async function POST(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  const pool = getPool();
  let client;

  try {
    const parsed = dispatchDeliverySchema.parse(await req.json().catch(() => ({})));

    client = await pool.connect();
    await client.query('BEGIN');

    // Ownership and readiness are checked in one place: a store may only
    // dispatch its own order, and only once it is actually prepared.
    const orderResult = await client.query(
      `SELECT o.id, o.status, o.delivery_lat, o.delivery_lng
       FROM orders o
       JOIN stores s ON o.store_id = s.id
       WHERE o.id = $1 AND s.user_id = $2
       FOR UPDATE`,
      [params.orderId, auth.userId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail('Pedido não encontrado', 404);
    }

    const order = orderResult.rows[0];
    if (!['ready', 'preparing', 'confirmed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return fail(`Pedido não pode sair para entrega no status "${order.status}"`, 409);
    }

    const { token, tokenHash } = generateDeliveryToken();

    // One delivery per order. Re-dispatching replaces the link, which also
    // revokes the previous one — the old token's hash is gone.
    const deliveryResult = await client.query(
      `INSERT INTO deliveries (order_id, courier_name, token_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE
         SET token_hash   = EXCLUDED.token_hash,
             courier_name = EXCLUDED.courier_name,
             status       = 'pending',
             expires_at   = now() + interval '6 hours',
             started_at   = NULL,
             delivered_at = NULL
       RETURNING id, expires_at`,
      [params.orderId, parsed.courierName ?? null, tokenHash]
    );

    await client.query(
      `UPDATE orders SET status = 'out_for_delivery', updated_at = now() WHERE id = $1`,
      [params.orderId]
    );

    await client.query('COMMIT');

    const hasDestination = order.delivery_lat != null && order.delivery_lng != null;

    return NextResponse.json(
      {
        deliveryId: deliveryResult.rows[0].id,
        courierPath: `/entrega/${token}`,
        expiresAt: deliveryResult.rows[0].expires_at,
        // Without a destination the map still shows the courier, but no ETA
        // can be computed — worth surfacing rather than failing silently.
        hasDestination,
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client?.query('ROLLBACK').catch(() => {});
    return fromError(error, 'Falha ao despachar entrega');
  } finally {
    client?.release();
  }
}
