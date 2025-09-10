import { Router } from 'express';
import { pool } from './models';

const router = Router();

// Store pending registrations in memory (in production, use Redis)
const pendingRegistrations = new Map<string, {
  ip: string;
  timestamp: number;
}>();

// Clean up expired registration codes (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  const expireTime = 10 * 60 * 1000; // 10 minutes
  
  for (const [code, data] of pendingRegistrations.entries()) {
    if (now - data.timestamp > expireTime) {
      pendingRegistrations.delete(code);
    }
  }
}, 60 * 1000); // Clean up every minute

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

// NEW: Generate registration code for device
router.post('/register-request', async (req, res) => {
  const { ip } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store pending registration
  pendingRegistrations.set(code, {
    ip,
    timestamp: Date.now()
  });

  console.log(`Registration code generated: ${code} for IP: ${ip}`);
  
  res.json({ code });
});

// NEW: Admin registers device using code
router.post('/register-device', async (req, res) => {
  const { code, name } = req.body;
  
  if (!code || !name) {
    return res.status(400).json({ error: 'Code and device name are required' });
  }

  // Check if code exists and is valid
  const pendingReg = pendingRegistrations.get(code);
  if (!pendingReg) {
    return res.status(404).json({ error: 'Invalid or expired registration code' });
  }

  try {
    // Create the device
    const result = await pool.query(
      'INSERT INTO devices (name, ip, status, last_ping) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [name.trim(), pendingReg.ip, 'offline']
    );

    // Remove from pending registrations
    pendingRegistrations.delete(code);

    console.log(`Device registered: ${name} (ID: ${result.rows[0].id}) with IP: ${pendingReg.ip}`);

    res.status(201).json({
      device: result.rows[0],
      message: 'Device registered successfully'
    });
  } catch (error) {
    console.error('Error registering device:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// NEW: Check registration status for polling
router.get('/check-registration/:ip', async (req, res) => {
  const { ip } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE ip = $1 ORDER BY id DESC LIMIT 1',
      [ip]
    );

    if (result.rows.length > 0) {
      res.json({
        registered: true,
        device: result.rows[0]
      });
    } else {
      res.json({
        registered: false
      });
    }
  } catch (error) {
    console.error('Error checking registration:', error);
    res.status(500).json({ error: 'Failed to check registration' });
  }
});

// Register a new device (legacy endpoint - keep for backward compatibility)
router.post('/', async (req, res) => {
  const { name, ip } = req.body;
  const result = await pool.query(
    'INSERT INTO devices (name, ip, status, last_ping) VALUES ($1, $2, $3, NOW()) RETURNING *',
    [name, ip, 'offline']
  );
  res.status(201).json(result.rows[0]);
});

// Get single device
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Device not found' });
  }
  
  res.json(result.rows[0]);
});

// Update device (for dashboard edits)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, ip } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Device name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE devices SET name = $1, ip = $2 WHERE id = $3 RETURNING *',
      [name.trim(), ip, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    console.log(`Device updated: ${name} (ID: ${id})`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM devices WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    console.log(`Device deleted: ${result.rows[0].name} (ID: ${id})`);
    res.json({ message: 'Device deleted successfully', device: result.rows[0] });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// FIXED: Update device status (heartbeat) - NO AUTO-RECREATION, returns 404 when device doesn't exist
router.patch('/:id', async (req, res) => {
  const { status, current_media, system_info, ip } = req.body;
  const { id } = req.params;

  try {
    let updateFields = ['status = $1', 'last_ping = NOW()', 'current_media = $2', 'system_info = $3'];
    let values = [status, current_media, system_info];
    let paramCounter = 4;

    // Only update IP if provided (don't update name to avoid overriding dashboard changes)
    if (ip && ip.trim() !== '') {
      updateFields.push(`ip = $${paramCounter}`);
      values.push(ip.trim());
      paramCounter++;
    }

    values.push(id);

    const query = `UPDATE devices SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      return res.json(result.rows[0]);
    } else {
      // Device not found - return 404 so client knows to re-register
      return res.status(404).json({ error: 'Device not found' });
    }
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});


export default router;