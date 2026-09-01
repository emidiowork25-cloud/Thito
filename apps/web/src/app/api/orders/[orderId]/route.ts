import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

type Params = { params: { orderId: string } };

export async function GET(req: Request, { params }: Params) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();

  try {
    const pool = getPool();

    const orderResult = await pool.query(
      `SELECT id, store_id, customer_id, status, total_price, notes,
              estimated_time_minutes, created_at, updated_at
       FROM orders WHERE id = $1`,
      [params.orderId]
    );

    if (orderResult.rows.length === 0) return fail('Pedido não encontrado', 404);

    const order = orderResult.rows[0];

    // An order is visible to the customer who placed it and to the store it
    // was placed with — nobody else.
    if (auth.userType === 'customer' && order.customer_id !== auth.userId) {
      return forbidden();
    }

    if (auth.userType === 'store') {
      const storeCheck = await pool.query(
        'SELECT id FROM stores WHERE id = $1 AND user_id = $2',
        [order.store_id, auth.userId]
      );
      if (storeCheck.rows.length === 0) return forbidden();
    }

    const itemsResult = await pool.query(
      `SELECT oi.id, oi.menu_item_id AS "menuItemId", mi.name, oi.quantity,
              oi.unit_price AS "unitPrice", oi.subtotal, oi.notes, oi.customizations
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [params.orderId]
    );

    return NextResponse.json({
      id: order.id,
      storeId: order.store_id,
      status: order.status,
      totalPrice: order.total_price,
      notes: order.notes,
      estimatedTimeMinutes: order.estimated_time_minutes,
      items: itemsResult.rows,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    });
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar pedido');
  }
}
