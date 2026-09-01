import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/**
 * Setup diagnostics. Reports whether each piece of configuration is present
 * and whether the database actually answers — never the values themselves,
 * since this endpoint is public.
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    JWT_SECRET: Boolean(process.env.JWT_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  let database: Record<string, unknown> = { connected: false };

  if (env.DATABASE_URL) {
    try {
      const result = await getPool().query(
        `SELECT (SELECT COUNT(*) FROM stores)     AS stores,
                (SELECT COUNT(*) FROM menu_items) AS items,
                (SELECT COUNT(*) FROM orders)     AS orders`
      );
      const row = result.rows[0];
      database = {
        connected: true,
        stores: Number(row.stores),
        menuItems: Number(row.items),
        orders: Number(row.orders),
      };
    } catch (error: any) {
      // The message names the failure mode (bad password, unreachable host)
      // without echoing the connection string.
      database = { connected: false, error: error.message };
    }
  }

  const ready = env.DATABASE_URL && env.JWT_SECRET && database.connected === true;

  return NextResponse.json(
    {
      ready,
      // Image upload is the only feature that needs the service role key.
      imageUploadReady: env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
      env,
      database,
    },
    { status: ready ? 200 : 503 }
  );
}
