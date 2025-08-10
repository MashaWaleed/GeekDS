import { Router } from 'express';
import { pool } from './models';

const router = Router();

// Device offline monitoring - check every minute and mark devices offline if no heartbeat for 3 minutes
const HEARTBEAT_TIMEOUT = 3 * 60 * 1000; // 3 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000; // Check every minute

setInterval(async () => {
  try {
    const cutoffTime = new Date(Date.now() - HEARTBEAT_TIMEOUT);
    await pool.query(
      'UPDATE devices SET status = $1 WHERE last_ping < $2 AND status != $1',
      ['offline', cutoffTime]
    );
  } catch (error) {
    console.error('Error checking device offline status:', error);
  }
}, CHECK_INTERVAL);

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

// ENHANCED: Update device status (heartbeat) with name and IP updates
// ENHANCED: Update or re-register device
router.patch('/:id', async (req, res) => {
  const { status, current_media, system_info, name, ip } = req.body;
  const { id } = req.params;

  try {
    let updateFields = ['status = $1', 'last_ping = NOW()', 'current_media = $2', 'system_info = $3'];
    let values = [status, current_media, system_info];
    let paramCounter = 4;

    if (name && name.trim() !== '') {
      updateFields.push(`name = $${paramCounter}`);
      values.push(name.trim());
      paramCounter++;
    }

    if (ip && ip.trim() !== '') {
      updateFields.push(`ip = $${paramCounter}`);
      values.push(ip.trim());
      paramCounter++;
    }

    values.push(id);

    const query = `UPDATE devices SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      return res.json(result.rows[0]); // Normal update path
    }

    // If device not found — re-insert it
    const insertResult = await pool.query(
      'INSERT INTO devices (id, name, ip, status, last_ping, current_media, system_info) VALUES ($1, $2, $3, $4, NOW(), $5, $6) RETURNING *',
      [
        id,
        name || `Device ${id}`,
        ip || null,
        status || 'offline',
        current_media || null,
        system_info || null,
      ]
    );

    console.warn(`Device ${id} not found — re-registering.`);
    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Error updating or re-registering device:', error);
    res.status(500).json({ error: 'Failed to update or re-register device' });
  }
});


export default router;