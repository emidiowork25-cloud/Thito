import { Pool, types } from 'pg';

// node-postgres hands back DECIMAL/NUMERIC as a string to avoid float
// precision loss. Every price in this app is read as a number by the UI
// (item.price.toFixed(2) and friends), so parse them here instead of at each
// of the ten call sites. Values are small currency amounts, well inside the
// range a double represents exactly.
types.setTypeParser(types.builtins.NUMERIC, (value) => parseFloat(value));

// Serverless-safe singleton: Vercel reuses the module scope between warm
// invocations, so we cache the pool on globalThis to avoid opening a new
// connection on every request.
const globalForPool = globalThis as unknown as { __chapaPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__chapaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    globalForPool.__chapaPool = new Pool({
      connectionString,
      // Supabase requires TLS but serves a cert the default CA bundle rejects.
      ssl: { rejectUnauthorized: false },
      // Keep the footprint small: serverless spawns many short-lived instances.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return globalForPool.__chapaPool;
}
