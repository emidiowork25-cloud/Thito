import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { getAuth } from '@/lib/server/auth';
import { createMenuItemSchema } from '@/lib/server/validation';
import { fail, unauthorized, forbidden, fromError } from '@/lib/server/http';

const ITEM_COLUMNS = `id, name, description, ingredients, price,
  category, image_url AS "imageUrl", is_available AS "isAvailable"`;

/**
 * Public listing takes ?storeId and returns only available items. A store
 * owner calling without storeId gets their own full menu, unavailable items
 * included, so the management screen can show everything it can edit.
 */
export async function GET(req: Request) {
  try {
    const storeId = new URL(req.url).searchParams.get('storeId');
    const pool = getPool();

    if (!storeId) {
      const auth = getAuth(req);
      if (!auth || auth.userType !== 'store') {
        return fail('storeId é obrigatório', 400);
      }

      const result = await pool.query(
        `SELECT ${ITEM_COLUMNS} FROM menu_items
         WHERE store_id = (SELECT id FROM stores WHERE user_id = $1)
         ORDER BY category, name`,
        [auth.userId]
      );
      return NextResponse.json(result.rows);
    }

    const result = await pool.query(
      `SELECT ${ITEM_COLUMNS} FROM menu_items
       WHERE store_id = $1 AND is_available = true
       ORDER BY category, name`,
      [storeId]
    );
    return NextResponse.json(result.rows);
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar cardápio');
  }
}

export async function POST(req: Request) {
  const auth = getAuth(req);
  if (!auth) return unauthorized();
  if (auth.userType !== 'store') return forbidden('Acesso restrito a lojas');

  try {
    const parsed = createMenuItemSchema.parse(await req.json());
    const pool = getPool();

    const storeResult = await pool.query('SELECT id FROM stores WHERE user_id = $1', [
      auth.userId,
    ]);
    if (storeResult.rows.length === 0) {
      return fail('Loja não encontrada', 404);
    }

    const result = await pool.query(
      `INSERT INTO menu_items (store_id, name, description, ingredients, price, category, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ITEM_COLUMNS}`,
      [
        storeResult.rows[0].id,
        parsed.name,
        parsed.description ?? null,
        parsed.ingredients ?? null,
        parsed.price,
        parsed.category ?? null,
        parsed.imageUrl ?? null,
      ]
    );

    await pool.query('INSERT INTO inventory (menu_item_id) VALUES ($1)', [
      result.rows[0].id,
    ]);

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error: any) {
    return fromError(error, 'Falha ao criar item');
  }
}
