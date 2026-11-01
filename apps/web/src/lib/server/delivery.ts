import { createHash, randomBytes } from 'crypto';

/** Metres per degree of latitude; longitude is scaled by cos(lat). */
const EARTH_RADIUS_M = 6_371_000;

/*
 * Straight-line distance underestimates a real trip, because streets do not
 * run point to point. 1.35 is the usual correction for dense urban grids —
 * rough, but honest about being rough, and it needs no routing service.
 */
const ROAD_WINDING_FACTOR = 1.35;

/** Scooter through city traffic, in metres per second (~22 km/h). */
const DEFAULT_SPEED_MPS = 6.1;

/** Below this the courier is stopped at a light, not making progress. */
const MIN_USABLE_SPEED_MPS = 1.5;

export function generateDeliveryToken(): { token: string; tokenHash: string } {
  // 32 bytes: far beyond guessing, and the URL stays short enough to send
  // over WhatsApp without wrapping.
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashDeliveryToken(token) };
}

/*
 * SHA-256, not bcrypt. The token is 256 bits of randomness rather than a
 * human-chosen secret, so there is no dictionary to slow down — and the
 * lookup has to be a single indexed query per ping.
 */
export function hashDeliveryToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in metres. */
export function haversineMetres(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface Eta {
  distanceMetres: number;
  etaMinutes: number;
  /** False when the estimate fell back to an assumed speed. */
  fromObservedSpeed: boolean;
}

/**
 * Distance-over-speed, corrected for the fact that streets wind. This is an
 * estimate, not a routed ETA: it does not know about one-way streets, river
 * crossings or traffic. A routing service would be more accurate and would
 * also mean an API key, a bill and a network hop on every poll.
 *
 * The courier's own reported speed is used when it looks like travel; a
 * courier stopped at a light would otherwise produce an ETA of infinity.
 */
export function estimateEta(
  courier: Point,
  destination: Point,
  observedSpeedMps?: number | null
): Eta {
  const straightLine = haversineMetres(courier, destination);
  const distanceMetres = straightLine * ROAD_WINDING_FACTOR;

  const usableSpeed =
    observedSpeedMps != null && observedSpeedMps >= MIN_USABLE_SPEED_MPS
      ? observedSpeedMps
      : null;

  const speed = usableSpeed ?? DEFAULT_SPEED_MPS;

  return {
    distanceMetres: Math.round(distanceMetres),
    // Always at least a minute: "chegando em 0 min" reads as broken.
    etaMinutes: Math.max(1, Math.round(distanceMetres / speed / 60)),
    fromObservedSpeed: usableSpeed !== null,
  };
}
