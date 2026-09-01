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

    const storeId = storeResult.rows[0].id;
    const filterByStatus = status && status !== 'all';

    const values: unknown[] = [storeId];
    let where = 'WHERE store_id = $1';
    if (filterByStatus) {
      values.push(status);
      where += ` AND status = $${values.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders ${where}`,
      values
    );

    const result = await pool.query(
      `SELECT id, customer_id AS "customerId", status, total_price AS "totalPrice",
              notes, estimated_time_minutes AS "estimatedTimeMinutes",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM orders ${where}
       ORDER BY created_at DESC
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
