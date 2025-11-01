import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from './models';

const router = Router();

// Secret key for JWT - should be in environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h'; // Token expires in 24 hours

// Extended Request interface to include user data
export interface AuthRequest extends Request {
  user?: {
    userId: number;
    username: string;
    role: string;
  };
}

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Fetch user from database
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`User logged in: ${user.username}`);

    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username,
        role: user.role 
      } 
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Middleware to verify JWT token
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  });
}

// Token refresh endpoint
router.post('/refresh', authenticateToken, (req: AuthRequest, res: Response) => {
  const user = req.user!;

  const newToken = jwt.sign(
    { 
      userId: user.userId, 
      username: user.username,
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({ token: newToken });
});

// Verify token endpoint (for frontend to check if token is still valid)
router.get('/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ 
    valid: true,
    user: req.user 
  });
});

// Logout endpoint (client-side only, just for logging)
router.post('/logout', authenticateToken, (req: AuthRequest, res: Response) => {
  console.log(`User logged out: ${req.user?.username}`);
  res.json({ message: 'Logged out successfully' });
});

export default router;
