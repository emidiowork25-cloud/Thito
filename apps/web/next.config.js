/** @type {import('next').NextConfig} */

// Only the Supabase project's storage may be optimised. A wildcard here turns
// the image optimiser into an open proxy: anyone can pass any URL and have
// this server fetch it, which reaches internal addresses too.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig = {
  reactStrictMode: true,
  // The header advertises the framework version, which is free reconnaissance.
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
};

module.exports = nextConfig;
