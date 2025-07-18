import { Router } from 'express';
import { pool } from './models';

const router = Router();

// List all playlists
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM playlists ORDER BY id');
  res.json(result.rows);
});

// Create a new playlist
router.post('/', async (req, res) => {
  const { name, media_files } = req.body;
  const playlistResult = await pool.query('INSERT INTO playlists (name) VALUES ($1) RETURNING *', [name]);
  const playlist = playlistResult.rows[0];
  if (media_files && Array.isArray(media_files)) {
    for (let i = 0; i < media_files.length; i++) {
      await pool.query('INSERT INTO playlist_media (playlist_id, media_id, position) VALUES ($1, $2, $3)', [playlist.id, media_files[i], i]);
    }
  }
  res.status(201).json(playlist);
});

// Get playlist details (with media)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
  if (playlistResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const playlist = playlistResult.rows[0];
  const mediaResult = await pool.query('SELECT m.* FROM playlist_media pm JOIN media_files m ON pm.media_id = m.id WHERE pm.playlist_id = $1 ORDER BY pm.position', [id]);
  playlist.media_files = mediaResult.rows;
  res.json(playlist);
});

// Update playlist (name or media)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, media_files } = req.body;
  if (name) {
    await pool.query('UPDATE playlists SET name = $1 WHERE id = $2', [name, id]);
  }
  if (media_files && Array.isArray(media_files)) {
    await pool.query('DELETE FROM playlist_media WHERE playlist_id = $1', [id]);
    for (let i = 0; i < media_files.length; i++) {
      await pool.query('INSERT INTO playlist_media (playlist_id, media_id, position) VALUES ($1, $2, $3)', [id, media_files[i], i]);
    }
  }
  res.json({ success: true });
});

// Delete playlist
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM playlists WHERE id = $1', [id]);
  res.json({ success: true });
});

export default router; 