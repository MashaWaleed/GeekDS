import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import devicesRouter from './devices';
import mediaRouter from './media';
import playlistsRouter from './playlists';
import schedulesRouter from './schedules';
import commandsRouter from './commands';
import foldersRouter from './folders';
import authRouter, { authenticateToken } from './auth';
import { connectRedis } from './redis';
import path from 'path';

dotenv.config();

const app = express();

// Enable CORS for all origins
app.use(cors());

// Enable gzip compression for API responses
app.use(compression({
  filter: (req, res) => {
    // Don't compress media files (already compressed)
    if (req.path.startsWith('/api/media/') || req.path.startsWith('/media/')) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
  level: 6 // Balance between speed and compression (1-9)
}));

app.use(express.json());

// Rate limiting to prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15 minutes (much more lenient)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints only
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Initialize Redis connection
connectRedis().catch(console.error);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount auth routes (with stricter rate limiting, no authentication required for login)
app.use('/api/auth', authLimiter, authRouter);

// Device routes - mixed auth strategy
// We need to selectively protect dashboard endpoints while keeping device-facing endpoints public
import devicesRouterWithAuth from './devices-auth-wrapper';
app.use('/api/devices', devicesRouterWithAuth);

// Playlists - devices need to fetch individual playlists, but management needs auth
import playlistsRouterWithAuth from './playlists-auth-wrapper';
app.use('/api/playlists', playlistsRouterWithAuth);

// Media - devices need to download media files, but management needs auth
import mediaRouterWithAuth from './media-auth-wrapper';
app.use('/api/media', mediaRouterWithAuth);

// Protected routes - require user authentication
app.use('/api/schedules', authenticateToken, schedulesRouter);
app.use('/api/folders', authenticateToken, foldersRouter);

// Commands need auth when accessed from dashboard
app.use('/api/commands', authenticateToken, commandsRouter);

// Static media files - no auth required (devices need to access these)
app.use('/media', express.static(path.join(__dirname, '../media')));

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
}); 