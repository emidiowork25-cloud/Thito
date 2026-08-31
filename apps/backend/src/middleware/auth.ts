import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  userType?: 'customer' | 'store';
}

export function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: { message: 'Missing token' } });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as any;
    req.userId = decoded.userId;
    req.userType = decoded.userType;
    next();
  } catch (error) {
    res.status(401).json({ error: { message: 'Invalid token' } });
  }
}

export function requireStore(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userType !== 'store') {
    return res.status(403).json({ error: { message: 'Store access required' } });
  }
  next();
}

export function requireCustomer(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userType !== 'customer') {
    return res.status(403).json({ error: { message: 'Customer access required' } });
  }
  next();
}
