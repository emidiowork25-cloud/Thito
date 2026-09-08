-- Shared rate-limit counters. Serverless instances do not share memory, so
-- the database is the only place a limit can actually be enforced across them.
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

/*
 * Counts one hit against `key` and reports the running total. The window
 * resets in the same statement it is read, so two concurrent requests cannot
 * both observe a stale count and slip past the limit.
 *
 * clock_timestamp(), not now(): now() is the transaction start time and does
 * not advance while a transaction is open, which would make expiry depend on
 * every call landing in its own transaction.
 *
 * search_path is pinned so the calling role cannot redirect `rate_limits` to
 * a table it controls and neutralise the limiter.
 */
CREATE OR REPLACE FUNCTION hit_rate_limit(p_key TEXT, p_window_seconds INTEGER)
RETURNS TABLE (hits INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  INSERT INTO rate_limits AS r (key, count, window_start)
  VALUES (p_key, 1, clock_timestamp())
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN r.window_start < clock_timestamp() - make_interval(secs => p_window_seconds)
          THEN 1 ELSE r.count + 1 END,
        window_start = CASE
          WHEN r.window_start < clock_timestamp() - make_interval(secs => p_window_seconds)
          THEN clock_timestamp() ELSE r.window_start END
  RETURNING count, window_start + make_interval(secs => p_window_seconds);
$$;

-- Keeps the table from growing without bound as keys age out.
CREATE OR REPLACE FUNCTION prune_rate_limits()
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  DELETE FROM rate_limits WHERE window_start < clock_timestamp() - interval '1 day';
$$;
