import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import devicesRouter from './devices';
import mediaRouter from './media';
import playlistsRouter from './playlists';
import schedulesRouter from './schedules';
import commandsRouter from './commands';
import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/media', mediaRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/devices', commandsRouter);
app.use('/media', express.static(path.join(__dirname, '../media')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
}); 