-- Orders gain a destination. Tracking is meaningless without one, and the
-- original schema had nowhere to put a delivery address.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat  DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng  DOUBLE PRECISION;

-- 'out_for_delivery' sits between ready and completed.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending', 'confirmed', 'preparing', 'ready',
             'out_for_delivery', 'completed', 'cancelled')
);

/*
 * One dispatch of one order to one courier.
 *
 * token_hash, never the token: the link is the only credential the courier
 * has, so storing it in clear would let anyone who reads this table
 * impersonate a courier and feed false positions. Looked up by hash.
 */
CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  courier_name  VARCHAR(100),
  token_hash    TEXT NOT NULL UNIQUE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'delivered', 'cancelled')),
  -- The link stops working after this, so a leaked URL is not valid forever.
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '6 hours',
  started_at    TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_token ON deliveries(token_hash);

-- Position pings. Kept as history rather than one mutable row so the route
-- can be drawn and a stalled courier shows up as a gap.
CREATE TABLE IF NOT EXISTS delivery_locations (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_id  UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  lat          DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m   REAL,
  speed_mps    REAL,
  heading_deg  REAL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_locations_latest
  ON delivery_locations(delivery_id, recorded_at DESC);

ALTER TABLE public.deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deliveries         FROM anon, authenticated;
REVOKE ALL ON public.delivery_locations FROM anon, authenticated;

-- Pings accumulate fast; a delivered run keeps only its trail for a day.
CREATE OR REPLACE FUNCTION prune_delivery_locations()
RETURNS void
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  DELETE FROM delivery_locations
  WHERE recorded_at < clock_timestamp() - interval '1 day';
$$;
