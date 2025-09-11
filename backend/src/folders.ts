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
    const { name, type, parent_id, createBoth = true } = req.body; // Default to true for unified folders

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Default behavior is to create unified folders (both media and playlist)
    if (createBoth || !type) {
      const results = [];
      
      for (const folderType of ['media', 'playlist']) {
        // Check if folder with same name and parent already exists
        const existing = await pool.query(
          'SELECT * FROM folders WHERE name = $1 AND type = $2 AND parent_id = $3',
          [name, folderType, parent_id || null]
        );
        
        if (existing.rows.length === 0) {
          const result = await pool.query(
            `INSERT INTO folders (name, type, parent_id, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW())
             RETURNING *`,
            [name, folderType, parent_id || null]
          );
          results.push(result.rows[0]);
        } else {
          results.push(existing.rows[0]);
        }
      }
      
      return res.status(201).json({ 
        success: true, 
        folders: results,
        message: `Created unified folder "${name}"` 
      });
    } else {
      // Create single folder (when explicitly specified)
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
    }
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update folder
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, updateCorresponding = true } = req.body; // Default to true for unified updates

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Get the current folder
    const currentFolder = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (currentFolder.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const folder = currentFolder.rows[0];
    const updatedFolders = [];

    // Update the main folder
    const result = await pool.query(
      `UPDATE folders
       SET name = $1, parent_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name, parent_id !== undefined ? parent_id : folder.parent_id, id]
    );
    updatedFolders.push(result.rows[0]);

    // Update corresponding folder by default (unified folders)
    if (updateCorresponding) {
      const otherType = folder.type === 'media' ? 'playlist' : 'media';
      const correspondingFolder = await pool.query(
        'SELECT * FROM folders WHERE name = $1 AND type = $2 AND parent_id = $3',
        [folder.name, otherType, folder.parent_id]
      );
      
      if (correspondingFolder.rows.length > 0) {
        const otherResult = await pool.query(
          `UPDATE folders
           SET name = $1, parent_id = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [name, parent_id !== undefined ? parent_id : folder.parent_id, correspondingFolder.rows[0].id]
        );
        updatedFolders.push(otherResult.rows[0]);
      }
    }

    res.json({
      success: true,
      folders: updatedFolders,
      message: updateCorresponding ? 
        `Updated unified folder "${name}"` : 
        `Updated folder "${name}"`
    });
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete folder
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteCorresponding = true } = req.query; // Default to true for unified deletion
    
    // Check if folder exists
    const folderResult = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
    if (folderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    const folder = folderResult.rows[0];
    const deletedFolders = [];
    
    // Delete corresponding folder by default (unified folders)
    if (deleteCorresponding === 'true' || deleteCorresponding === true) {
      const otherType = folder.type === 'media' ? 'playlist' : 'media';
      const correspondingFolder = await pool.query(
        'SELECT * FROM folders WHERE name = $1 AND type = $2 AND parent_id = $3',
        [folder.name, otherType, folder.parent_id]
      );
      
      if (correspondingFolder.rows.length > 0) {
        const otherFolder = correspondingFolder.rows[0];
        
        // Move content from corresponding folder to no folder
        if (otherFolder.type === 'media') {
          await pool.query('UPDATE media_files SET folder_id = NULL WHERE folder_id = $1', [otherFolder.id]);
        } else if (otherFolder.type === 'playlist') {
          await pool.query('UPDATE playlists SET folder_id = NULL WHERE folder_id = $1', [otherFolder.id]);
        }
        
        // Delete child folders recursively
        await pool.query('DELETE FROM folders WHERE parent_id = $1', [otherFolder.id]);
        
        // Delete corresponding folder
        await pool.query('DELETE FROM folders WHERE id = $1', [otherFolder.id]);
        deletedFolders.push(otherFolder.id);
      }
    }
    
    // Move any media files or playlists in this folder to no folder (folder_id = null)
    if (folder.type === 'media') {
      await pool.query('UPDATE media_files SET folder_id = NULL WHERE folder_id = $1', [id]);
    } else if (folder.type === 'playlist') {
      await pool.query('UPDATE playlists SET folder_id = NULL WHERE folder_id = $1', [id]);
    }
    
    // Delete child folders recursively  
    await pool.query('DELETE FROM folders WHERE parent_id = $1', [id]);
    
    // Delete the main folder
    await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    deletedFolders.push(parseInt(id, 10));
    
    res.json({ 
      success: true, 
      deleted_ids: deletedFolders,
      message: deleteCorresponding ? 
        `Deleted unified folder "${folder.name}"` : 
        `Deleted folder "${folder.name}"`
    });
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
