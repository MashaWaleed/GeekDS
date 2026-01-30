import { Router } from 'express';
import { pool } from './models';
import { cacheMiddleware, invalidateCache, CACHE_KEYS, CACHE_TTL } from './redis';

const router = Router();

// List all playlists (cached)
router.get('/', cacheMiddleware(CACHE_KEYS.PLAYLISTS, CACHE_TTL.PLAYLISTS), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.*, 
        f.name as folder_name,
        (
          SELECT COALESCE(json_agg(pm.media_id ORDER BY pm.position), '[]'::json)
          FROM playlist_media pm 
          WHERE pm.playlist_id = p.id
        ) as media_files
      FROM playlists p
      LEFT JOIN folders f ON p.folder_id = f.id
      ORDER BY p.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Create a new playlist
router.post('/', async (req, res) => {
  try {
    const { name, media_files, folder_id } = req.body;
    
    // Check for duplicate playlist name
    const existingPlaylist = await pool.query(
      'SELECT id, name FROM playlists WHERE name = $1',
      [name]
    );
    
    if (existingPlaylist.rows.length > 0) {
      return res.status(409).json({ 
        error: 'A playlist with this name already exists',
        message: `Playlist "${name}" already exists. Please choose a different name.`,
        existing_id: existingPlaylist.rows[0].id
      });
    }
    
    const playlistResult = await pool.query(
      'INSERT INTO playlists (name, folder_id, updated_at) VALUES ($1, $2, NOW()) RETURNING *', 
      [name, folder_id || null]
    );
    const playlist = playlistResult.rows[0];
    
    if (media_files && Array.isArray(media_files)) {
      for (let i = 0; i < media_files.length; i++) {
        await pool.query(
          'INSERT INTO playlist_media (playlist_id, media_id, position) VALUES ($1, $2, $3)', 
          [playlist.id, media_files[i], i]
        );
      }
    }
    
    // Invalidate playlists and schedules caches (schedules join playlist fields and devices rely on playlist updates)
    await invalidateCache(CACHE_KEYS.PLAYLISTS + '*');
    await invalidateCache(CACHE_KEYS.SCHEDULES + '*');
    await invalidateCache('device:*:schedule_cache');
    
    res.status(201).json(playlist);
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Get playlist details (with media)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1', [id]);
  if (playlistResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const playlist = playlistResult.rows[0];
  const mediaResult = await pool.query('SELECT m.id, m.filename, m.saved_filename, m.type, m.duration FROM playlist_media pm JOIN media_files m ON pm.media_id = m.id WHERE pm.playlist_id = $1 ORDER BY pm.position', [id]);
  playlist.media_files = mediaResult.rows.map(m => m.id);
  playlist.media_details = mediaResult.rows;
  res.json(playlist);
});

// Update playlist (name or media)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, media_files, folder_id } = req.body;
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    
    if (folder_id !== undefined) {
      updates.push(`folder_id = $${paramCount++}`);
      values.push(folder_id || null);
    }
    
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(id);
      await pool.query(
        `UPDATE playlists SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        values
      );
    }
    
    if (media_files && Array.isArray(media_files)) {
      await pool.query('DELETE FROM playlist_media WHERE playlist_id = $1', [id]);
      for (let i = 0; i < media_files.length; i++) {
        await pool.query('INSERT INTO playlist_media (playlist_id, media_id, position) VALUES ($1, $2, $3)', [id, media_files[i], i]);
      }
      // Update playlist timestamp to trigger change detection
      await pool.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [id]);
    }
    
    // Invalidate playlists and schedules caches
    await invalidateCache(CACHE_KEYS.PLAYLISTS + '*');
    await invalidateCache(CACHE_KEYS.SCHEDULES + '*');
    
    // CRITICAL: Invalidate device-specific schedule caches
    // When playlist content changes, devices using this playlist must be notified
    await invalidateCache('device:*:schedule_cache');
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// Delete playlist
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM playlists WHERE id = $1', [id]);
  
  // Invalidate playlists and schedules caches
  await invalidateCache(CACHE_KEYS.PLAYLISTS + '*');
  await invalidateCache(CACHE_KEYS.SCHEDULES + '*');
  
  // CRITICAL: Invalidate device-specific schedule caches
  await invalidateCache('device:*:schedule_cache');
  
  res.json({ success: true });
});

export default router;