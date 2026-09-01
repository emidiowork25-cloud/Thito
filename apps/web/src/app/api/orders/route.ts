import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { createOrderSchema } from '@/lib/server/validation';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'customer') return forbidden('Acesso restrito a clientes');

  const pool = getPool();
  const client = await pool.connect();

  try {
    const parsed = createOrderSchema.parse(await req.json());

    await client.query('BEGIN');

    const storeCheck = await client.query('SELECT id FROM stores WHERE id = $1', [
      parsed.storeId,
    ]);
    if (storeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail('Loja não encontrada', 404);
    }

    // Prices come from the database, never from the client payload, so a
    // tampered cart cannot change what the order costs.
    let totalPrice = 0;
    const orderItems = [];

    for (const item of parsed.items) {
      const itemResult = await client.query(
        `SELECT id, price FROM menu_items
         WHERE id = $1 AND store_id = $2 AND is_available = true`,
        [item.menuItemId, parsed.storeId]
      );

      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return fail('Um dos itens não está disponível', 400);
      }

      const price = parseFloat(itemResult.rows[0].price);
      const subtotal = price * item.quantity;
      totalPrice += subtotal;

      orderItems.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: price,
        subtotal,
        notes: item.notes || null,
        customizations: item.customizations || null,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (store_id, customer_id, total_price, notes, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, store_id, status, total_price, created_at`,
      [parsed.storeId, auth.userId, totalPrice, parsed.notes || null]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, quantity, unit_price, subtotal, notes, customizations)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.menuItemId,
          item.quantity,
          item.unitPrice,
          item.subtotal,
          item.notes,
          item.customizations ? JSON.stringify(item.customizations) : null,
        ]
      );
    }

    await client.query('COMMIT');

    return NextResponse.json(
      {
        orderId: order.id,
        storeId: order.store_id,
        status: order.status,
        totalPrice: order.total_price,
        createdAt: order.created_at,
      },
      { status: 201 }
    );
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    return fromError(error, 'Falha ao criar pedido');
  } finally {
    client.release();
  }
}

export async function GET(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'customer') return forbidden('Acesso restrito a clientes');

  try {
    const result = await getPool().query(
      `SELECT id, store_id AS "storeId", status, total_price AS "totalPrice",
              notes, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM orders
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [auth.userId]
    );

    return NextResponse.json(result.rows);
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar pedidos');
  }
}
