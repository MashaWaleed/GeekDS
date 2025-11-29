import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { pool } from './models';
import fs from 'fs';
import { getVideoDurationInSeconds } from 'get-video-duration';

const router = Router();
const upload = multer({ dest: path.join(__dirname, '../media') });

// List all media files
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, f.name as folder_name 
      FROM media_files m
      LEFT JOIN folders f ON m.folder_id = f.id
      ORDER BY m.upload_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching media files:', error);
    res.status(500).json({ error: 'Failed to fetch media files' });
  }
});

// Upload a new media file
router.post('/', upload.single('file'), async (req, res) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    
    const { originalname, filename, mimetype, size } = file;
    const { folder_id } = req.body; // Get folder_id from form data
    
    let duration = 0;
    try {
      if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) {
        const durationSeconds = await getVideoDurationInSeconds(file.path);
        duration = Math.round(durationSeconds); // Round to nearest integer
      }
    } catch (durationError) {
      console.error('Could not get media duration:', durationError);
      // keep duration as 0 if analysis fails
    }
    
    // Save both the original filename and the saved (random) filename
    const result = await pool.query(
      'INSERT INTO media_files (filename, saved_filename, type, duration, folder_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [originalname, filename, mimetype, duration, folder_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading media file:', error);
    res.status(500).json({ error: 'Failed to upload media file' });
  }
});

// Serve a media file by original filename
router.get('/:filename', async (req, res) => {
  const { filename } = req.params;
  // Look up the actual saved file in the database
  const result = await pool.query('SELECT * FROM media_files WHERE filename = $1', [filename]);
  if (result.rows.length === 0) return res.status(404).send('Not found');
  const savedFile = result.rows[0].saved_filename || result.rows[0].filename; // fallback for old uploads
  const filePath = path.join(__dirname, '../media', savedFile);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// Delete a media file
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT saved_filename, filename FROM media_files WHERE id = $1', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const savedFile = result.rows[0].saved_filename || result.rows[0].filename;
  await pool.query('DELETE FROM media_files WHERE id = $1', [id]);
  const filePath = path.join(__dirname, '../media', savedFile);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

export default router;