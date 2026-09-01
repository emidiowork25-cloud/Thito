-- Public read so <img src> works straight off the returned URL; no insert or
-- update policy, so only the service role (server-side upload route) writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('menu-images', 'menu-images', true, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read for menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');
