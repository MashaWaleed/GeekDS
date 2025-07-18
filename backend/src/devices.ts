import { Router } from 'express';
import { pool } from './models';

const router = Router();

// List all devices
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM devices ORDER BY id');
  res.json(result.rows);
});

// Register a new device
router.post('/', async (req, res) => {
  const { name, ip } = req.body;
  const result = await pool.query(
    'INSERT INTO devices (name, ip, status, last_ping) VALUES ($1, $2, $3, NOW()) RETURNING *',
    [name, ip, 'offline']
  );
  res.status(201).json(result.rows[0]);
});

// Update device status (heartbeat)
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  const result = await pool.query(
    'UPDATE devices SET status = $1, last_ping = NOW() WHERE id = $2 RETURNING *',
    [status, id]
  );
  res.json(result.rows[0]);
});

export default router; 