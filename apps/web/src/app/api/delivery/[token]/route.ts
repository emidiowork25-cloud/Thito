import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashDeliveryToken } from '@/lib/server/delivery';
import { fail, fromError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Params = { params: { token: string } };

/**
 * What the courier's page needs: where to go, and what it is carrying.
 *
 * The link is the credential, so this is deliberately unauthenticated — but
 * it is scoped hard: the courier sees the destination and the item list, and
 * nothing about the customer's account or other orders.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const result = await getPool().query(
      `SELECT d.id, d.status, d.courier_name AS "courierName", d.expires_at AS "expiresAt",
              o.id AS "orderId", o.delivery_address AS "address",
              o.delivery_lat AS "lat", o.delivery_lng AS "lng",
              o.notes, o.total_price AS "totalPrice",
              s.name AS "storeName",
              COALESCE(items.list, '[]'::json) AS items
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('name', mi.name, 'quantity', oi.quantity)
                         ORDER BY oi.created_at) AS list
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = o.id
       ) items ON true
       WHERE d.token_hash = $1`,
      [hashDeliveryToken(params.token)]
    );

    if (result.rows.length === 0) {
      // Same answer for a wrong token and a deleted delivery: no way to
      // probe which tokens once existed.
      return fail('Link de entrega inválido', 404);
    }

    const delivery = result.rows[0];

    if (new Date(delivery.expiresAt) < new Date()) {
      return fail('Este link de entrega expirou', 410);
    }
    if (delivery.status === 'delivered') {
      return fail('Esta entrega já foi concluída', 410);
    }
    if (delivery.status === 'cancelled') {
      return fail('Esta entrega foi cancelada', 410);
    }

    return NextResponse.json({
      deliveryId: delivery.id,
      status: delivery.status,
      courierName: delivery.courierName,
      storeName: delivery.storeName,
      orderId: delivery.orderId,
      destination:
        delivery.lat != null && delivery.lng != null
          ? { lat: delivery.lat, lng: delivery.lng, address: delivery.address }
          : { address: delivery.address },
      notes: delivery.notes,
      totalPrice: delivery.totalPrice,
      items: delivery.items,
    });
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar entrega');
  }
}
