import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness only. An earlier version returned the driver's error text and row
 * counts to anyone who asked, which leaked the database user, host and
 * schema. Setup details now require the operator token.
 */
export async function GET(req: Request) {
  const expected = process.env.HEALTH_TOKEN;
  const provided = req.headers.get('x-health-token');
  const detailed = Boolean(expected) && provided === expected;

  const configured = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    JWT_SECRET: Boolean(process.env.JWT_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  let connected = false;
  let detail: Record<string, unknown> = {};

  if (configured.DATABASE_URL) {
    try {
      const result = await getPool().query(
        `SELECT (SELECT COUNT(*) FROM stores)     AS stores,
                (SELECT COUNT(*) FROM menu_items) AS items,
                (SELECT COUNT(*) FROM orders)     AS orders`
      );
      connected = true;
      if (detailed) {
        detail = {
          stores: Number(result.rows[0].stores),
          menuItems: Number(result.rows[0].items),
          orders: Number(result.rows[0].orders),
        };
      }
    } catch (error: any) {
      console.error('Health check database error:', error.message);
      if (detailed) detail = { error: error.message };
    }
  }

  const ready = configured.DATABASE_URL && configured.JWT_SECRET && connected;

  // Unauthenticated callers get a bare yes/no, which is all a monitor needs.
  if (!detailed) {
    return NextResponse.json({ status: ready ? 'ok' : 'degraded' }, {
      status: ready ? 200 : 503,
    });
  }

  return NextResponse.json(
    {
      ready,
      imageUploadReady:
        configured.NEXT_PUBLIC_SUPABASE_URL && configured.SUPABASE_SERVICE_ROLE_KEY,
      env: configured,
      database: { connected, ...detail },
    },
    { status: ready ? 200 : 503 }
  );
}
