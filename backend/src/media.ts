import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { pool } from './models';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: path.join(__dirname, '../media') });

// List all media files
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM media_files ORDER BY upload_date DESC');
  res.json(result.rows);
});

// Upload a new media file
router.post('/', upload.single('file'), async (req, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const { originalname, filename, mimetype, size } = file;
  const result = await pool.query(
    'INSERT INTO media_files (filename, type, duration) VALUES ($1, $2, $3) RETURNING *',
    [originalname, mimetype, 0] // Duration can be updated later
  );
  res.status(201).json(result.rows[0]);
});

// Serve a media file
router.get('/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../media', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// Delete a media file
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT filename FROM media_files WHERE id = $1', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const filename = result.rows[0].filename;
  await pool.query('DELETE FROM media_files WHERE id = $1', [id]);
  const filePath = path.join(__dirname, '../media', filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
});

export default router; 