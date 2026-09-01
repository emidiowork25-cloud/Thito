import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

export async function GET(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  try {
    const searchParams = new URL(req.url).searchParams;
    const status = searchParams.get('status');
    // Clamp the page size so a crafted query cannot ask for the whole table.
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const pool = getPool();

    const storeResult = await pool.query('SELECT id FROM stores WHERE user_id = $1', [
      auth.userId,
    ]);
    if (storeResult.rows.length === 0) return fail('Loja não encontrada', 404);

    const values: unknown[] = [storeResult.rows[0].id];
    // Both queries alias the table as `o`, so one filter string serves both.
    let statusFilter = '';
    if (status && status !== 'all') {
      values.push(status);
      statusFilter = ` AND o.status = $${values.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders o WHERE o.store_id = $1${statusFilter}`,
      values
    );

    // Each order carries its items, which the dashboard maps over directly.
    // COALESCE keeps that an array rather than null for an order with none.
    const result = await pool.query(
      `SELECT o.id, o.customer_id AS "customerId", o.status,
              o.total_price AS "totalPrice", o.notes,
              o.estimated_time_minutes AS "estimatedTimeMinutes",
              o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              COALESCE(items.list, '[]'::json) AS items
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'name', mi.name,
                  'quantity', oi.quantity,
                  'customizations', oi.customizations
                ) ORDER BY oi.created_at) AS list
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE oi.order_id = o.id
       ) items ON true
       WHERE o.store_id = $1${statusFilter}
       ORDER BY o.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    return NextResponse.json({
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
      orders: result.rows,
    });
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar pedidos da loja');
  }
}
