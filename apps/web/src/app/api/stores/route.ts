import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { fromError } from '@/lib/server/http';

// This handler takes no Request, so Next would otherwise try to prerender it
// at build time — when DATABASE_URL is not available.
export const dynamic = 'force-dynamic';

/**
 * Public store directory. The customer menu needs a store to point at, so it
 * falls back to the first store here when no ?storeId is supplied.
 */
export async function GET() {
  try {
    const result = await getPool().query(
      `SELECT s.id, s.name, s.description, s.logo_url AS "logoUrl",
              COUNT(mi.id) FILTER (WHERE mi.is_available) AS "itemCount"
       FROM stores s
       LEFT JOIN menu_items mi ON mi.store_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at`
    );

    return NextResponse.json(
      result.rows.map((row) => ({ ...row, itemCount: Number(row.itemCount) }))
    );
  } catch (error: any) {
    return fromError(error, 'Falha ao carregar lojas');
  }
}
