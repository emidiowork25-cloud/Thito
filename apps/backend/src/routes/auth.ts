import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../config/database';
import { generateToken } from '../utils/jwt';
import { registerSchema, loginSchema } from '../utils/validation';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const pool = getPool();

    const hashedPassword = await bcrypt.hash(parsed.password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, user_type, name) VALUES ($1, $2, $3, $4) RETURNING id, email, user_type, name',
      [parsed.email, hashedPassword, parsed.userType, parsed.name]
    );

    const user = result.rows[0];

    // If store, create store profile
    if (parsed.userType === 'store') {
      await pool.query(
        'INSERT INTO stores (user_id, name) VALUES ($1, $2)',
        [user.id, parsed.name]
      );
    }

    const token = generateToken({
      userId: user.id,
      userType: user.user_type,
      email: user.email,
    });

    res.status(201).json({
      userId: user.id,
      email: user.email,
      name: user.name,
      userType: user.user_type,
      token,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: { message: 'Email already registered' } });
    }
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: 'Registration failed' } });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      'SELECT id, email, password_hash, user_type, name FROM users WHERE email = $1',
      [parsed.email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const isPasswordValid = await bcrypt.compare(parsed.password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: { message: 'Invalid credentials' } });
    }

    const token = generateToken({
      userId: user.id,
      userType: user.user_type,
      email: user.email,
    });

    res.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      userType: user.user_type,
      token,
    });
  } catch (error: any) {
    if (error.issues) {
      return res.status(400).json({ error: { message: error.issues[0].message } });
    }
    res.status(500).json({ error: { message: 'Login failed' } });
  }
});

router.get('/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, email, name, user_type FROM users WHERE id = $1',
      [req.userId]
    );

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.user_type,
    });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to fetch user' } });
  }
});

export default router;
