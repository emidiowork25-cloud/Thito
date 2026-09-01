import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

export interface TokenPayload {
  userId: string;
  userType: 'customer' | 'store';
  email: string;
}

export function generateToken(payload: TokenPayload): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return (jwt.sign as any)(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

/** Reads the bearer token off a request and returns its payload, or null. */
export function getAuth(req: Request): TokenPayload | null {
  const token = req.headers.get('authorization')?.split(' ')[1];
  if (!token || !JWT_SECRET) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
