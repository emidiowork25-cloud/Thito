import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { estimateEta } from '@/lib/server/delivery';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Params = { params: { orderId: string } };

// Enough of the trail to draw the route without shipping an unbounded array
// to a phone on mobile data.
const TRAIL_POINTS = 60;

/**
 * Where the courier is, for the customer who placed the order and for the
 * store that is fulfilling it. Nobody else: a delivery reveals a home
 * address and a person's live position.
 */
export async function GET(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();

  try {
    const pool = getPool();

    const orderResult = await pool.query(
      `SELECT o.id, o.status, o.customer_id, o.store_id,
              o.delivery_address AS address, o.delivery_lat AS lat, o.delivery_lng AS lng
       FROM orders o
       WHERE o.id = $1`,
      [params.orderId]
    );

    if (orderResult.rows.length === 0) return fail('Pedido não encontrado', 404);
    const order = orderResult.rows[0];

    if (auth.userType === 'customer' && order.customer_id !== auth.userId) {
      return forbidden();
    }
    if (auth.userType === 'store') {
      const owns = await pool.query(
        'SELECT 1 FROM stores WHERE id = $1 AND user_id = $2',
        [order.store_id, auth.userId]
      );
      if (owns.rows.length === 0) return forbidden();
    }

    const deliveryResult = await pool.query(
      `SELECT id, status, courier_name AS "courierName", started_at AS "startedAt",
              delivered_at AS "deliveredAt"
       FROM deliveries WHERE order_id = $1`,
      [params.orderId]
    );

    if (deliveryResult.rows.length === 0) {
      return NextResponse.json({ tracking: false, orderStatus: order.status });
    }

    const delivery = deliveryResult.rows[0];

    const trail = await pool.query(
      `SELECT lat, lng, speed_mps AS "speed", recorded_at AS "recordedAt"
       FROM delivery_locations
       WHERE delivery_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [delivery.id, TRAIL_POINTS]
    );

    // Newest first out of the query, oldest first for drawing a path.
    const points = trail.rows.reverse();
    const latest = points[points.length - 1] ?? null;

    const destination =
      order.lat != null && order.lng != null
        ? { lat: order.lat, lng: order.lng, address: order.address }
        : null;

    const eta =
      latest && destination
        ? estimateEta(
            { lat: latest.lat, lng: latest.lng },
            { lat: destination.lat, lng: destination.lng },
            latest.speed
          )
        : null;

    // A courier whose phone locked stops pinging; staleness is surfaced so
    // the UI can say "última posição há X min" instead of implying live.
    const staleSeconds = latest
      ? Math.round((Date.now() - new Date(latest.recordedAt).getTime()) / 1000)
      : null;

    return NextResponse.json({
      tracking: true,
      orderStatus: order.status,
      deliveryStatus: delivery.status,
      courierName: delivery.courierName,
      startedAt: delivery.startedAt,
      deliveredAt: delivery.deliveredAt,
      destination,
      courier: latest ? { lat: latest.lat, lng: latest.lng } : null,
      trail: points.map((p: any) => ({ lat: p.lat, lng: p.lng })),
      staleSeconds,
      eta,
    });
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar rastreio');
  }
}
