/**
 * Brand mark.
 *
 * The drawing is the product: one signal enters on the left, reaches the hub,
 * and leaves as three. That is literally what the platform does, which is why
 * the mark is a fan-out rather than a generic node graph or the usual
 * broadcast-wave icon.
 *
 * Two densities exist because one shape cannot do both jobs. The open mark
 * breathes in the header; the badge stays legible at 16px in a browser tab,
 * where the open version's strokes collapse into each other.
 */

const SKY = '#90C2E7';
const TEAL = '#22819A';
const GROUND = '#08262C';

interface MarkProps {
  size?: number;
  /** Renders in a single colour, taking the surrounding text colour. */
  mono?: boolean;
  className?: string;
}

export function LogoMark({ size = 34, mono = false, className }: MarkProps): JSX.Element {
  const rays = mono ? 'currentColor' : TEAL;
  const nodes = mono ? 'currentColor' : SKY;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="SRT HUB EASY"
    >
      {/* Signal in */}
      <path d="M2 24h8.5" stroke={rays} strokeWidth="3.4" strokeLinecap="round" />
      {/* Three legs out */}
      <path d="M21 24C29 24 29 8 37.5 8" stroke={rays} strokeWidth="3" strokeLinecap="round" />
      <path d="M21 24h16.5" stroke={rays} strokeWidth="3" strokeLinecap="round" />
      <path d="M21 24C29 24 29 40 37.5 40" stroke={rays} strokeWidth="3" strokeLinecap="round" />
      {/* The hub itself, deliberately the largest element */}
      <circle cx="16" cy="24" r="5.6" fill={nodes} />
      <circle cx="41.5" cy="8" r="3.4" fill={nodes} />
      <circle cx="41.5" cy="24" r="3.4" fill={nodes} />
      <circle cx="41.5" cy="40" r="3.4" fill={nodes} />
    </svg>
  );
}

/** Solid badge for favicons and app icons, where the open mark loses legibility. */
export function LogoBadge({ size = 32, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="SRT HUB EASY"
    >
      <rect x="1" y="1" width="46" height="46" rx="13.5" fill={SKY} />
      <path d="M20 24C26 24 26 13 32 13" stroke={GROUND} strokeWidth="3.1" strokeLinecap="round" />
      <path d="M20 24h12" stroke={GROUND} strokeWidth="3.1" strokeLinecap="round" />
      <path d="M20 24C26 24 26 35 32 35" stroke={GROUND} strokeWidth="3.1" strokeLinecap="round" />
      <circle cx="16" cy="24" r="5" fill={GROUND} />
      <circle cx="34.5" cy="13" r="2.9" fill={GROUND} />
      <circle cx="34.5" cy="24" r="2.9" fill={GROUND} />
      <circle cx="34.5" cy="35" r="2.9" fill={GROUND} />
    </svg>
  );
}

export const BRAND_NAME = 'SRT HUB EASY';

interface LogoProps {
  /** `sm` for the app header, `lg` for the landing and login screens. */
  size?: 'sm' | 'lg';
  /**
   * Platform name from settings. An administrator can rebrand the install, and
   * when they do, the mark stays but the wordmark follows their name.
   */
  siteName?: string;
  className?: string;
}

/**
 * The wordmark is set as one uninterrupted phrase. "Easy" is part of the name,
 * not a qualifier attached to it, so nothing sets it apart typographically.
 */
export function Logo({ size = 'sm', siteName, className }: LogoProps): JSX.Element {
  const large = size === 'lg';

  return (
    <span className={`inline-flex items-center ${large ? 'gap-3.5' : 'gap-2.5'} ${className ?? ''}`}>
      <LogoMark size={large ? 52 : 32} />
      <span
        className={`font-display font-bold uppercase leading-none tracking-[.02em] text-paper ${
          large ? 'text-4xl' : 'text-xl'
        }`}
      >
        {siteName?.trim() || BRAND_NAME}
      </span>
    </span>
  );
}
