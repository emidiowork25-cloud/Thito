import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { fail, fromError } from '@/lib/server/http';

export async function GET(req: Request) {
  try {
    const storeId = new URL(req.url).searchParams.get('storeId');
    if (!storeId) return fail('storeId é obrigatório', 400);

    const result = await getPool().query(
      `SELECT DISTINCT category FROM menu_items
       WHERE store_id = $1 AND is_available = true AND category IS NOT NULL
       ORDER BY category`,
      [storeId]
    );

    return NextResponse.json(result.rows.map((row) => row.category));
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar categorias');
  }
}
