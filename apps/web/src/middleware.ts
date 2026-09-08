import { NextRequest, NextResponse } from 'next/server';

/**
 * Only the Supabase project may be contacted or load images from, so a
 * script that somehow ran could not quietly ship data to a third party.
 */
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

function contentSecurityPolicy(isDev: boolean) {
  const external = [SUPABASE_ORIGIN].filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    /*
     * Next.js ships its hydration payload in inline <script> tags. A nonce
     * would be stronger, but a nonce must be minted per request and these
     * pages are prerendered at build time — the HTML is written once, so
     * there is no request whose nonce it could carry. Forcing every page to
     * render per request would fix that at the cost of a serverless
     * invocation per page view.
     *
     * What carries the weight instead: no dangerouslySetInnerHTML, no eval
     * and no innerHTML anywhere in the codebase (React escapes every value
     * rendered), so there is no path that turns stored data into script.
     * connect-src below still contains any script that did run.
     */
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${external}`,
    "font-src 'self' data:",
    "media-src 'self'",
    // The exfiltration boundary: even a script that ran could not reach a
    // host that is not this origin or the project's own Supabase.
    `connect-src 'self' ${external}${isDev ? ' ws: http://localhost:*' : ''}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ]
    .join('; ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const csp = contentSecurityPolicy(isDev);

  const response = NextResponse.next();

  response.headers.set('content-security-policy', csp);
  // Belt and braces with frame-ancestors, for anything that predates CSP.
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );
  response.headers.set(
    'strict-transport-security',
    'max-age=63072000; includeSubDomains; preload'
  );
  // Isolates this origin from cross-origin popups and embeds.
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('x-permitted-cross-domain-policies', 'none');

  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own static output, which is immutable and
    // served straight from the CDN.
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
