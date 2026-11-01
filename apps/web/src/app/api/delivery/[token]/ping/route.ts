import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashDeliveryToken, estimateEta } from '@/lib/server/delivery';
import { locationPingSchema } from '@/lib/server/validation';
import { rateLimit } from '@/lib/server/rate-limit';
import { fail, tooManyRequests, fromError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

type Params = { params: { token: string } };

/** Records one position from the courier and answers with the current ETA. */
export async function POST(req: Request, { params }: Params) {
  const pool = getPool();

  try {
    const parsed = locationPingSchema.parse(await req.json());
    const tokenHash = hashDeliveryToken(params.token);

    // Keyed on the delivery, not the IP: a courier on mobile data changes IP
    // mid-route. One ping every two seconds is plenty for a moving vehicle.
    const { allowed, retryAfterSeconds } = await rateLimit(`ping:${tokenHash}`, 30, 60);
    if (!allowed) return tooManyRequests(retryAfterSeconds);

    const deliveryResult = await pool.query(
      `SELECT d.id, d.status, d.expires_at,
              o.delivery_lat AS lat, o.delivery_lng AS lng
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.token_hash = $1`,
      [tokenHash]
    );

    if (deliveryResult.rows.length === 0) return fail('Link de entrega inválido', 404);

    const delivery = deliveryResult.rows[0];
    if (new Date(delivery.expires_at) < new Date()) {
      return fail('Este link de entrega expirou', 410);
    }
    if (delivery.status === 'delivered' || delivery.status === 'cancelled') {
      return fail('Esta entrega já foi encerrada', 410);
    }

    await pool.query(
      `INSERT INTO delivery_locations (delivery_id, lat, lng, accuracy_m, speed_mps, heading_deg)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        delivery.id,
        parsed.lat,
        parsed.lng,
        parsed.accuracy ?? null,
        parsed.speed ?? null,
        parsed.heading ?? null,
      ]
    );

    // The first ping is what flips the delivery to active, so "started" means
    // the courier actually began transmitting, not merely that a link exists.
    if (delivery.status === 'pending') {
      await pool.query(
        `UPDATE deliveries SET status = 'active', started_at = now() WHERE id = $1`,
        [delivery.id]
      );
    }

    const eta =
      delivery.lat != null && delivery.lng != null
        ? estimateEta(
            { lat: parsed.lat, lng: parsed.lng },
            { lat: delivery.lat, lng: delivery.lng },
            parsed.speed
          )
        : null;

    return NextResponse.json({ recorded: true, eta });
  } catch (error: any) {
    return fromError(error, 'Falha ao registrar posição');
  }
}
