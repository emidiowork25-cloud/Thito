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

/**
 * TLS is verified against the public CA set. Supabase's poolers present a
 * publicly trusted certificate, so nothing extra is needed; the direct
 * `db.*.supabase.co` endpoint is signed by Supabase's own CA, which can be
 * supplied through DATABASE_CA_CERT. Verification is never disabled — an
 * unverified connection would let anyone on the path read credentials and
 * order data in clear.
 */
function tlsOptions() {
  const ca = process.env.DATABASE_CA_CERT;
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

export function getPool(): Pool {
  if (!globalForPool.__chapaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool({
      connectionString,
      ssl: tlsOptions(),
      // Keep the footprint small: serverless spawns many short-lived instances.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // A wedged query must not pin a pooled connection indefinitely.
      statement_timeout: 15_000,
      query_timeout: 15_000,
    });

    // An idle client that errors (network drop, server restart) emits on the
    // pool; without a listener Node treats it as an unhandled error and exits.
    pool.on('error', (error) => {
      console.error('Idle database client error:', error.message);
    });

    globalForPool.__chapaPool = pool;
  }

  return globalForPool.__chapaPool;
}
