import express from 'express';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import devicesRouter from './devices';
import mediaRouter from './media';
import playlistsRouter from './playlists';
import schedulesRouter from './schedules';
import commandsRouter from './commands';
import foldersRouter from './folders';
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

// Initialize Redis connection
connectRedis().catch(console.error);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/media', mediaRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/devices', commandsRouter);
app.use('/api/folders', foldersRouter);
app.use('/media', express.static(path.join(__dirname, '../media')));

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
}); 