import { Router } from 'express';
import { pool } from './models';

const router = Router();

// List all folders
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    
    let query = 'SELECT * FROM folders';
    const params = [];
    
    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }
    
    query += ' ORDER BY name';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create a new folder
router.post('/', async (req, res) => {
  try {
    const { name, type, parent_id } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    if (!['media', 'playlist'].includes(type)) {
      return res.status(400).json({ error: 'Type must be either "media" or "playlist"' });
    }

    const result = await pool.query(
      `INSERT INTO folders (name, type, parent_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [name, type, parent_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update folder
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      `UPDATE folders
       SET name = $1, parent_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, parent_id || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete folder
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if folder exists
    const folderResult = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const folder = folderResult.rows[0];
    
    // Move any media files or playlists in this folder to no folder (folder_id = null)
    if (folder.type === 'media') {
      await pool.query('UPDATE media_files SET folder_id = NULL WHERE folder_id = $1', [id]);
    } else if (folder.type === 'playlist') {
      await pool.query('UPDATE playlists SET folder_id = NULL WHERE folder_id = $1', [id]);
    }
    
    // Delete the folder
    const result = await pool.query('DELETE FROM folders WHERE id = $1 RETURNING id', [id]);
    
    res.json({ success: true, deleted_id: parseInt(id, 10) });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Get folder contents
router.get('/:id/contents', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get folder info
    const folderResult = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const folder = folderResult.rows[0];
    let contents = [];
    
    if (folder.type === 'media') {
      const result = await pool.query(
        'SELECT * FROM media_files WHERE folder_id = $1 ORDER BY filename',
        [id]
      );
      contents = result.rows;
    } else if (folder.type === 'playlist') {
      const result = await pool.query(
        'SELECT * FROM playlists WHERE folder_id = $1 ORDER BY name',
        [id]
      );
      contents = result.rows;
    }
    
    res.json({
      folder,
      contents
    });
  } catch (error) {
    console.error('Error fetching folder contents:', error);
    res.status(500).json({ error: 'Failed to fetch folder contents' });
  }
});

export default router;
