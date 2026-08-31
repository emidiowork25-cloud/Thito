import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '7d';

export interface TokenPayload {
  userId: string;
  userType: 'customer' | 'store';
  email: string;
}

export function generateToken(payload: TokenPayload): string {
  return (jwt.sign as any)(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
}

export function verifyTokenPayload(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
