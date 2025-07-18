import { Router } from 'express';
import { pool } from './models';

const router = Router();

// Send a command to a device
router.post('/:id/command', async (req, res) => {
  const { id } = req.params;
  const { command, parameters } = req.body;
  const result = await pool.query(
    'INSERT INTO device_commands (device_id, command, parameters) VALUES ($1, $2, $3) RETURNING *',
    [id, command, parameters || {}]
  );
  res.status(201).json(result.rows[0]);
});

// List pending commands for a device
router.get('/:id/commands', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM device_commands WHERE device_id = $1 AND status = $2 ORDER BY created_at',
    [id, 'pending']
  );
  res.json(result.rows);
});

export default router; 