-- The app reaches Postgres over a direct connection as the table owner, which
-- bypasses RLS. Enabling RLS with no policies therefore changes nothing for
-- the app while closing the PostgREST surface, where the anon key would
-- otherwise read every row of these tables -- password hashes included.
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users       FROM anon, authenticated;
REVOKE ALL ON public.stores      FROM anon, authenticated;
REVOKE ALL ON public.menu_items  FROM anon, authenticated;
REVOKE ALL ON public.orders      FROM anon, authenticated;
REVOKE ALL ON public.order_items FROM anon, authenticated;
REVOKE ALL ON public.inventory   FROM anon, authenticated;
