import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

// Pinned on both sides. Verifying without an explicit algorithm list lets a
// token pick its own — the classic confusion attack, where a forged token
// declares "none" or swaps HMAC for RSA and passes.
const ALGORITHM = 'HS256' as const;
const ISSUER = 'chapa-quente';
const AUDIENCE = 'chapa-quente-app';

// HS256 with a short secret is brute-forceable offline from a single captured
// token, so refuse to sign with one rather than provide false assurance.
const MIN_SECRET_BYTES = 32;

export interface TokenPayload {
  userId: string;
  userType: 'customer' | 'store';
  email: string;
}

function assertUsableSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  if (Buffer.byteLength(JWT_SECRET, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes; it is the only thing standing between a captured token and a forged one`
    );
  }
}

export function generateToken(payload: TokenPayload): string {
  assertUsableSecret();
  return (jwt.sign as any)(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Reads the bearer token off a request and returns its payload, or null. */
export function getAuth(req: Request): TokenPayload | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || !JWT_SECRET) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;

    // A signature only proves the token is ours, not that it carries the
    // shape callers assume; every field is checked before it is trusted.
    if (
      typeof decoded.userId !== 'string' ||
      typeof decoded.email !== 'string' ||
      (decoded.userType !== 'customer' && decoded.userType !== 'store')
    ) {
      return null;
    }

    return {
      userId: decoded.userId,
      userType: decoded.userType,
      email: decoded.email,
    };
  } catch {
    return null;
  }
}
