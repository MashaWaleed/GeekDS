import { Router } from 'express';
import { pool } from './models';

const router = Router();

// List all schedules
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM schedules ORDER BY id');
  res.json(result.rows);
});

// Create a new schedule
router.post('/', async (req, res) => {
  const { device_id, playlist_id, start_time, end_time, repeat } = req.body;
  const result = await pool.query(
    'INSERT INTO schedules (device_id, playlist_id, start_time, end_time, repeat) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [device_id, playlist_id, start_time, end_time, repeat]
  );
  res.status(201).json(result.rows[0]);
});

// Update schedule
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { device_id, playlist_id, start_time, end_time, repeat } = req.body;
  await pool.query(
    'UPDATE schedules SET device_id = $1, playlist_id = $2, start_time = $3, end_time = $4, repeat = $5 WHERE id = $6',
    [device_id, playlist_id, start_time, end_time, repeat, id]
  );
  res.json({ success: true });
});

// Delete schedule
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
  res.json({ success: true });
});

export default router; 