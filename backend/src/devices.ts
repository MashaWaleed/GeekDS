import { Router } from 'express';
import { pool } from './models';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { cacheMiddleware, invalidateCache, CACHE_KEYS, CACHE_TTL, getRedisClient } from './redis';

const router = Router();

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Configure multer for screenshot uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, screenshotsDir);
  },
  filename: (req, file, cb) => {
    const deviceId = req.params.id || 'unknown';
    const timestamp = Date.now();
    cb(null, `device_${deviceId}_${timestamp}.png`);
  }
});

// NEW: Check registration by durable UUID (preferred)
router.get('/check-registration/by-uuid/:uuid', async (req, res) => {
  const { uuid } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE uuid = $1 LIMIT 1',
      [uuid]
    );

    if (result.rows.length > 0) {
      res.json({ registered: true, device: result.rows[0] });
    } else {
      res.json({ registered: false });
    }
  } catch (error) {
    console.error('Error checking registration by uuid:', error);
    res.status(500).json({ error: 'Failed to check registration' });
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Clean up old screenshots every hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  fs.readdir(screenshotsDir, (err, files) => {
    if (err) return;
    
    files.forEach(file => {
      const filepath = path.join(screenshotsDir, file);
      fs.stat(filepath, (err, stats) => {
        if (err) return;
        
        if (stats.mtime.getTime() < oneHourAgo) {
          fs.unlink(filepath, (err) => {
            if (err) console.error('Error deleting old screenshot:', err);
          });
        }
      });
    });
  });
}, 60 * 60 * 1000); // Run every hour

// Store pending registrations in memory (in production, use Redis)
const pendingRegistrations = new Map<string, {
  ip: string;
  uuid: string;  // Add UUID for durable device identification
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

// Device offline monitoring - heartbeat is ~30s, so mark offline at ~1.5x = 45s
const HEARTBEAT_TIMEOUT = 45 * 1000; // 45 seconds
const CHECK_INTERVAL = 15 * 1000; // Check every 15 seconds for faster detection

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
router.get('/', cacheMiddleware(CACHE_KEYS.DEVICES, CACHE_TTL.DEVICES), async (req, res) => {
  const result = await pool.query('SELECT * FROM devices ORDER BY id');
  res.json(result.rows);
});

// NEW: Generate registration code for device
router.post('/register-request', async (req, res) => {
  const { ip, uuid } = req.body;
  
  if (!ip) {
    return res.status(400).json({ error: 'IP address required' });
  }

  if (!uuid) {
    return res.status(400).json({ error: 'UUID required' });
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store pending registration with UUID
  pendingRegistrations.set(code, {
    ip,
    uuid,
    timestamp: Date.now()
  });

  console.log(`Registration code generated: ${code} for UUID: ${uuid.substring(0, 8)}... (IP: ${ip})`);
  
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
    // Create the device with UUID (primary identifier)
    const result = await pool.query(
      'INSERT INTO devices (name, ip, uuid, status, last_ping) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [name.trim(), pendingReg.ip, pendingReg.uuid, 'online']
    );

    // Remove from pending registrations
    pendingRegistrations.delete(code);

    console.log(`Device registered: ${name} (ID: ${result.rows[0].id}) with UUID: ${pendingReg.uuid.substring(0, 8)}... (IP: ${pendingReg.ip})`);

    // Invalidate devices cache so it shows up immediately in the dashboard
    await invalidateCache(CACHE_KEYS.DEVICES + '*');
    await invalidateCache('device:*');

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
    [name, ip, 'online']
  );
  
  // Invalidate devices cache
  await invalidateCache(CACHE_KEYS.DEVICES + '*');
  
  res.status(201).json(result.rows[0]);
});

// Get single device (do not cache path-param based resource to avoid stale/mis-keyed cache)
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
    // Invalidate related caches: devices list, specific devices, schedules (device_name joined)
    await invalidateCache(CACHE_KEYS.DEVICES + '*');
    await invalidateCache('device:*');
    await invalidateCache(CACHE_KEYS.SCHEDULES + '*');
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
    // Invalidate related caches: devices list, specific devices, schedules (cascaded deletions)
    await invalidateCache(CACHE_KEYS.DEVICES + '*');
    await invalidateCache('device:*');
    await invalidateCache(CACHE_KEYS.SCHEDULES + '*');
    res.json({ message: 'Device deleted successfully', device: result.rows[0] });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// FIXED: Update device status (legacy heartbeat) - retained for backward compatibility
router.patch('/:id', async (req, res) => {
  const { status, current_media, system_info, ip, uuid } = req.body;
  const { id } = req.params;

  try {
    let updateFields = ['status = $1', 'last_ping = NOW()', 'current_media = $2', 'system_info = $3'];
    let values: any[] = [status, current_media, system_info];
    let paramCounter = 4;

    // Only update IP if provided (don't update name to avoid overriding dashboard changes)
    if (ip && ip.trim() !== '') {
      updateFields.push(`ip = $${paramCounter}`);
      values.push(ip.trim());
      paramCounter++;
    }

    // Optionally update uuid if provided and missing
    if (uuid && uuid.trim() !== '') {
      updateFields.push(`uuid = $${paramCounter}`);
      values.push(uuid.trim());
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

// NEW MERGED HEARTBEAT ENDPOINT
// Contract:
// PATCH /api/devices/:id/heartbeat
// Body: {
//   playback_state: 'playing' | 'standby',
//   versions: { schedule: number, playlist: number, commands_cursor: number },
//   name?: string, ip?: string, uuid?: string
// }
// Response: {
//   schedule_changed: boolean,
//   playlist_changed: boolean,
//   new_versions: { schedule: number, playlist: number },
//   active_playlist_id: number|null,
//   commands: [{ id, type, request_id? }]
// }
// In-memory last version/cache (volatile, improves disappearance detection without schema change)
const lastDeviceVersions: Record<string, { scheduleVersion: number; playlistVersion: number; hadActive: boolean; allSchedulesVersion: number }> = {};

// Batch ping updates queue - flushes every 5 seconds
const pendingPingUpdates = new Map<string, { playback_state: string | null; timestamp: number }>();

// Flush batch updates every 5 seconds
setInterval(async () => {
  if (pendingPingUpdates.size === 0) return;
  
  const updates = Array.from(pendingPingUpdates.entries());
  pendingPingUpdates.clear();
  
  try {
    // Batch update all devices in single query
    for (const [deviceId, data] of updates) {
      await pool.query(
        'UPDATE devices SET last_ping = NOW(), status = $1, current_media = $2 WHERE id = $3',
        ['online', data.playback_state, deviceId]
      );
    }
    console.log(`[Heartbeat] Batch updated ${updates.length} device pings`);
  } catch (error) {
    console.error('Batch ping update error:', error);
  }
}, 5000);

router.patch('/:id/heartbeat', async (req, res) => {
  const { id } = req.params;
  const {
    playback_state,
    versions = {},
    name,
    ip,
    uuid
  } = req.body || {};

  try {
    // Check if device exists before proceeding
    const deviceCheck = await pool.query('SELECT id FROM devices WHERE id = $1', [id]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    // Check Redis cache first for schedule data
    const redisClient = getRedisClient();
    const cacheKey = `device:${id}:schedule_cache`;
    let cachedScheduleData: any = null;
    
    if (redisClient && redisClient.isReady) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          cachedScheduleData = JSON.parse(cached);
        }
      } catch (err) {
        console.error('Redis cache read error:', err);
      }
    }

    const clientScheduleVersion = parseInt(versions.schedule || 0, 10) || 0;
    const clientPlaylistVersion = parseInt(versions.playlist || 0, 10) || 0;
    const clientAllSchedulesVersion = parseInt(versions.all_schedules || 0, 10) || 0;

    let scheduleVersion = 0;
    let playlistVersion = 0;
    let activePlaylistId: number | null = null;
    let allSchedulesVersion = 0;
    let scheduleChanged = false;
    let playlistChanged = false;
    let activeSchedule = null;
    let needsDbQuery = true;

    // Check if we can use cached data (versions match)
    if (cachedScheduleData) {
      const cachedVersions = cachedScheduleData.versions || {};
      
      if (cachedVersions.schedule === clientScheduleVersion &&
          cachedVersions.playlist === clientPlaylistVersion &&
          cachedVersions.all_schedules === clientAllSchedulesVersion) {
        
        // Use cached response - no DB query needed!
        scheduleVersion = cachedVersions.schedule;
        playlistVersion = cachedVersions.playlist;
        allSchedulesVersion = cachedVersions.all_schedules;
        activePlaylistId = cachedScheduleData.active_playlist_id;
        scheduleChanged = false;
        playlistChanged = false;
        needsDbQuery = false;
        
        console.log(`[Heartbeat] Cache hit for device ${id} - skipping schedule queries`);
      }
    }

    // Only query database if cache miss or versions changed
    if (needsDbQuery) {
      // Determine active schedule for this device (server-side filtering)
      const now = new Date();
      const day = now.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
      const timeStr = now.toISOString().substring(11,16); // HH:mm from ISO

      const scheduleQuery = await pool.query(
        `SELECT s.*, p.updated_at as playlist_updated_at, p.id as pl_id,
                EXTRACT(EPOCH FROM s.updated_at)*1000 AS schedule_version_ms,
                EXTRACT(EPOCH FROM p.updated_at)*1000 AS playlist_version_ms
         FROM schedules s
         JOIN playlists p ON p.id = s.playlist_id
         WHERE s.device_id = $1
           AND s.is_enabled = true
           AND (s.valid_from IS NULL OR s.valid_from <= CURRENT_DATE)
           AND (s.valid_until IS NULL OR s.valid_until >= CURRENT_DATE)
           AND $2 = ANY (s.days_of_week)
           AND s.time_slot_start <= $3::time
           AND s.time_slot_end >= $3::time
         ORDER BY s.time_slot_start
         LIMIT 1`,
        [id, day, timeStr]
      );

      if (scheduleQuery.rows.length > 0) {
        const row = scheduleQuery.rows[0];
        activeSchedule = row;
        scheduleVersion = Math.floor(row.schedule_version_ms) || 0;
        playlistVersion = Math.floor(row.playlist_version_ms) || 0;
        activePlaylistId = row.pl_id;
      }

      // Check ALL schedules version to detect edits to inactive schedules
      const allSchedulesQuery = await pool.query(
        `SELECT MAX(EXTRACT(EPOCH FROM updated_at)*1000) AS max_version
         FROM schedules
         WHERE device_id = $1 AND is_enabled = true`,
        [id]
      );
      allSchedulesVersion = Math.floor(allSchedulesQuery.rows[0]?.max_version || 0);

      const prev = lastDeviceVersions[id] || { scheduleVersion: 0, playlistVersion: 0, hadActive: false, allSchedulesVersion: 0 };
      const hasActiveNow = !!activeSchedule;
      
      // Check if active schedule changed OR if any schedule was edited (including inactive ones)
      const activeScheduleChanged = (scheduleVersion > 0 && scheduleVersion !== clientScheduleVersion) || (prev.hadActive && !hasActiveNow) || (!prev.hadActive && hasActiveNow);
      const anyScheduleEdited = allSchedulesVersion > 0 && allSchedulesVersion !== clientAllSchedulesVersion;
      scheduleChanged = activeScheduleChanged || anyScheduleEdited;
      
      playlistChanged = playlistVersion > 0 && playlistVersion !== clientPlaylistVersion;

      // Update memory snapshot
      lastDeviceVersions[id] = { scheduleVersion, playlistVersion, hadActive: hasActiveNow, allSchedulesVersion };

      // Cache the result in Redis for 30 seconds
      if (redisClient && redisClient.isReady) {
        try {
          const cacheData = {
            versions: { schedule: scheduleVersion, playlist: playlistVersion, all_schedules: allSchedulesVersion },
            active_playlist_id: activePlaylistId,
            cached_at: Date.now()
          };
          await redisClient.setEx(cacheKey, 30, JSON.stringify(cacheData));
          console.log(`[Heartbeat] Cached schedule data for device ${id}`);
        } catch (err) {
          console.error('Redis cache write error:', err);
        }
      }
    }

    // Queue the ping update for batch processing (instead of immediate UPDATE)
    pendingPingUpdates.set(id, { playback_state: playback_state || null, timestamp: Date.now() });

    // Update metadata fields immediately if provided (ignore name to prevent overwrite)
    if (ip || uuid) {
      await pool.query(
        `UPDATE devices
         SET ip = COALESCE($1, ip),
             uuid = COALESCE($2, uuid)
         WHERE id = $3`,
        [ip || null, uuid || null, id]
      );
    }

    // 3. Pull pending screenshot requests (acts as commands queue)
    const screenshotReq = await pool.query(
      `SELECT id FROM screenshot_requests
       WHERE device_id = $1 AND status = 'pending'
       ORDER BY requested_at ASC LIMIT 1`,
      [id]
    );

    const commands: any[] = [];
    if (screenshotReq.rows.length > 0) {
      const reqId = screenshotReq.rows[0].id;
      // Mark as processing
      await pool.query(
        'UPDATE screenshot_requests SET status = $1, processed_at = NOW() WHERE id = $2',
        ['processing', reqId]
      );
      commands.push({ id: reqId, type: 'screenshot_request', request_id: reqId });
    }

    return res.json({
      schedule_changed: scheduleChanged,
      playlist_changed: playlistChanged,
      new_versions: { schedule: scheduleVersion, playlist: playlistVersion, all_schedules: allSchedulesVersion },
      active_playlist_id: activePlaylistId,
      commands
    });
  } catch (error) {
    console.error('Merged heartbeat error:', error);
    return res.status(500).json({ error: 'Heartbeat processing failed' });
  }
});

// NEW: Get ALL schedules for a device (for offline caching)
router.get('/:id/schedules/all', async (req, res) => {
  const { id } = req.params;
  try {
    const q = await pool.query(
      `SELECT s.*, 
              EXTRACT(EPOCH FROM s.updated_at)*1000 AS schedule_version_ms
       FROM schedules s
       WHERE s.device_id = $1
         AND s.is_enabled = true
       ORDER BY s.time_slot_start`,
      [id]
    );

    const schedules = q.rows.map(row => ({
      id: row.id,
      playlist_id: row.playlist_id,
      name: row.name,
      days_of_week: row.days_of_week,
      time_slot_start: row.time_slot_start,
      time_slot_end: row.time_slot_end,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      is_enabled: row.is_enabled,
      version: Math.floor(row.schedule_version_ms) || 0
    }));

    // Calculate aggregate version: MAX of all schedule updated_at timestamps
    // This matches the heartbeat calculation (MAX version) for consistency
    const aggregateVersion = schedules.length > 0 
      ? Math.max(...schedules.map(s => s.version))
      : 0;

    return res.json({
      schedules,
      count: schedules.length,
      version: aggregateVersion  // Aggregate version changes when ANY schedule changes
    });
  } catch (error) {
    console.error('Fetch all schedules error:', error);
    return res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// NEW: Device-specific schedule endpoint returns current active schedule snapshot & versions
router.get('/:id/schedule', async (req, res) => {
  const { id } = req.params;
  try {
    const now = new Date();
    const day = now.toLocaleDateString('en-GB', { weekday: 'long' }).toLowerCase();
    const timeStr = now.toISOString().substring(11,16); // HH:mm
    const q = await pool.query(
      `SELECT s.*, p.updated_at as playlist_updated_at, p.id as pl_id,
              EXTRACT(EPOCH FROM s.updated_at)*1000 AS schedule_version_ms,
              EXTRACT(EPOCH FROM p.updated_at)*1000 AS playlist_version_ms
       FROM schedules s
       JOIN playlists p ON p.id = s.playlist_id
       WHERE s.device_id = $1
         AND s.is_enabled = true
         AND (s.valid_from IS NULL OR s.valid_from <= CURRENT_DATE)
         AND (s.valid_until IS NULL OR s.valid_until >= CURRENT_DATE)
         AND $2 = ANY (s.days_of_week)
         AND s.time_slot_start <= $3::time
         AND s.time_slot_end >= $3::time
       ORDER BY s.time_slot_start
       LIMIT 1`,
      [id, day, timeStr]
    );

    if (q.rows.length === 0) {
      return res.json({
        version: 0,
        playlist_version: 0,
        schedule: null
      });
    }

    const row = q.rows[0];
    const schedule = {
      playlist_id: row.playlist_id,
      name: row.name,
      days_of_week: row.days_of_week,
      time_slot_start: row.time_slot_start,
      time_slot_end: row.time_slot_end,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      is_enabled: row.is_enabled
    };
    return res.json({
      version: Math.floor(row.schedule_version_ms) || 0,
      playlist_version: Math.floor(row.playlist_version_ms) || 0,
      schedule
    });
  } catch (error) {
    console.error('Device schedule fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch device schedule' });
  }
});

// NEW: Request screenshot from device (HTTP polling approach with completion waiting)
router.post('/:id/screenshot', async (req, res) => {
  const { id } = req.params;
  const timeout = 15000; // 15 seconds timeout

  try {
    // Check if device exists and is online
    const deviceResult = await pool.query(
      'SELECT id, name, status FROM devices WHERE id = $1',
      [id]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = deviceResult.rows[0];
    
    if (device.status !== 'online') {
      return res.status(400).json({ error: 'Device is offline' });
    }

    // Create a screenshot request record in database
    const requestResult = await pool.query(
      'INSERT INTO screenshot_requests (device_id, requested_at, status) VALUES ($1, NOW(), $2) RETURNING id',
      [id, 'pending']
    );

    const requestId = requestResult.rows[0].id;
    console.log(`Screenshot request queued for device ${device.name} (ID: ${id}), request ID: ${requestId}`);
    
    // Wait for screenshot completion with timeout
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check if screenshot was completed
      const statusResult = await pool.query(
        'SELECT status, screenshot_filename, error_message FROM screenshot_requests WHERE id = $1',
        [requestId]
      );

      if (statusResult.rows.length > 0) {
        const request = statusResult.rows[0];
        
        if (request.status === 'completed') {
          return res.json({
            message: 'Screenshot captured successfully',
            device_id: id,
            device_name: device.name,
            screenshot_filename: request.screenshot_filename,
            request_id: requestId
          });
        } else if (request.status === 'failed') {
          return res.status(500).json({
            error: 'Screenshot capture failed',
            message: request.error_message || 'Unknown error'
          });
        }
      }

      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Timeout reached - mark request as timeout
    await pool.query(
      'UPDATE screenshot_requests SET status = $1, error_message = $2 WHERE id = $3',
      ['timeout', 'Request timed out', requestId]
    );

    return res.status(408).json({
      error: 'Screenshot request timed out',
      message: 'Device did not respond within 15 seconds',
      request_id: requestId
    });

  } catch (error) {
    console.error('Error requesting screenshot:', error);
    res.status(500).json({ error: 'Failed to request screenshot' });
  }
});

// NEW: Device polls for commands (including screenshot requests)
// Renamed to avoid conflict with device_commands endpoint in commands.ts
router.get('/:id/commands/poll', async (req, res) => {
  const { id } = req.params;

  try {
    // Check for pending screenshot requests
    const screenshotRequests = await pool.query(
      'SELECT id FROM screenshot_requests WHERE device_id = $1 AND status = $2 ORDER BY requested_at DESC LIMIT 1',
      [id, 'pending']
    );

    const commands = [];

    if (screenshotRequests.rows.length > 0) {
      const requestId = screenshotRequests.rows[0].id;
      
      // Mark as processing
      await pool.query(
        'UPDATE screenshot_requests SET status = $1, processed_at = NOW() WHERE id = $2',
        ['processing', requestId]
      );

      commands.push({
        type: 'screenshot_request',
        request_id: requestId,
        timestamp: Date.now()
      });

      console.log(`Screenshot command sent to device ${id} via polling`);
    }

    res.json({ commands });

  } catch (error) {
    console.error('Error getting commands:', error);
    res.status(500).json({ error: 'Failed to get commands' });
  }
});

// NEW: Device uploads screenshot
router.post('/:id/screenshot/upload', upload.single('screenshot'), async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No screenshot file provided' });
    }

    console.log(`Screenshot uploaded for device ${id}: ${req.file.filename}, size: ${req.file.size} bytes`);
    
    // Mark the most recent pending screenshot request as completed
    const updateResult = await pool.query(
      `UPDATE screenshot_requests 
       SET status = $1, completed_at = NOW(), screenshot_filename = $2, processed_at = NOW()
       WHERE id = (
         SELECT id FROM screenshot_requests 
         WHERE device_id = $3 AND status = $4 
         ORDER BY requested_at DESC 
         LIMIT 1
       )
       RETURNING id`,
      ['completed', req.file.filename, id, 'pending']
    );
    
    // If no pending request found, try to update the most recent timeout request
    if (updateResult.rows.length === 0) {
      console.log(`No pending request found, trying to update most recent request for device ${id}`);
      const fallbackUpdate = await pool.query(
        `UPDATE screenshot_requests 
         SET status = $1, completed_at = NOW(), screenshot_filename = $2, processed_at = NOW()
         WHERE device_id = $3 
         AND requested_at = (
           SELECT MAX(requested_at) FROM screenshot_requests 
           WHERE device_id = $3
         )
         RETURNING id, status as old_status`,
        ['completed', req.file.filename, id]
      );
      
      if (fallbackUpdate.rows.length > 0) {
        console.log(`Updated request ${fallbackUpdate.rows[0].id} from ${fallbackUpdate.rows[0].old_status} to completed`);
      } else {
        console.log(`No screenshot request found for device ${id}`);
      }
    } else {
      console.log(`Marked screenshot request ${updateResult.rows[0].id} as completed`);
    }
    
    res.json({
      message: 'Screenshot uploaded successfully',
      filename: req.file.filename,
      size: req.file.size,
      device_id: id
    });
  } catch (error) {
    console.error('Error uploading screenshot:', error);
    
    // Mark request as failed if there was an error
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await pool.query(
        `UPDATE screenshot_requests 
         SET status = $1, error_message = $2 
         WHERE id = (
           SELECT id FROM screenshot_requests 
           WHERE device_id = $3 AND status = $4 
           ORDER BY requested_at DESC 
           LIMIT 1
         )`,
        ['failed', errorMessage, id, 'pending']
      );
    } catch (dbError) {
      console.error('Error updating failed screenshot request:', dbError);
    }
    
    res.status(500).json({ error: 'Failed to upload screenshot' });
  }
});

// NEW: Get screenshot for device
router.get('/:id/screenshot/latest', async (req, res) => {
  const { id } = req.params;

  try {
    // Find the latest screenshot for this device
    const files = fs.readdirSync(screenshotsDir);
    const deviceScreenshots = files
      .filter(file => file.startsWith(`device_${id}_`))
      .map(file => ({
        filename: file,
        timestamp: parseInt(file.split('_')[2].split('.')[0])
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (deviceScreenshots.length === 0) {
      return res.status(404).json({ error: 'No screenshot found for this device' });
    }

    const latestScreenshot = deviceScreenshots[0];
    const filepath = path.join(screenshotsDir, latestScreenshot.filename);
    
    res.sendFile(filepath);
  } catch (error) {
    console.error('Error getting screenshot:', error);
    res.status(500).json({ error: 'Failed to get screenshot' });
  }
});

// NEW: Check if screenshot exists for device
router.get('/:id/screenshot/status', async (req, res) => {
  const { id } = req.params;

  try {
    const files = fs.readdirSync(screenshotsDir);
    const deviceScreenshots = files
      .filter(file => file.startsWith(`device_${id}_`))
      .map(file => ({
        filename: file,
        timestamp: parseInt(file.split('_')[2].split('.')[0])
      }))
      .sort((a, b) => b.timestamp - a.timestamp);

    if (deviceScreenshots.length === 0) {
      return res.json({ 
        available: false, 
        message: 'No screenshot available' 
      });
    }

    const latestScreenshot = deviceScreenshots[0];
    const age = Date.now() - latestScreenshot.timestamp;

    res.json({
      available: true,
      filename: latestScreenshot.filename,
      timestamp: latestScreenshot.timestamp,
      age_seconds: Math.floor(age / 1000)
    });
  } catch (error) {
    console.error('Error checking screenshot status:', error);
    res.status(500).json({ error: 'Failed to check screenshot status' });
  }
});

// NEW: Claim or create device by durable UUID (auto-recovery after DB wipe)
router.post('/claim', async (req, res) => {
  const { uuid, name, ip, system_info } = req.body;

  if (!uuid || typeof uuid !== 'string' || uuid.trim() === '') {
    return res.status(400).json({ error: 'uuid is required' });
  }

  try {
    // Try to find existing device by UUID
    const existing = await pool.query('SELECT * FROM devices WHERE uuid = $1 LIMIT 1', [uuid]);

    if (existing.rows.length > 0) {
      // Update metadata and mark online
      const upd = await pool.query(
        `UPDATE devices
         SET name = COALESCE($1, name),
             ip = COALESCE($2, ip),
             status = 'online',
             last_ping = NOW(),
             system_info = COALESCE($3, system_info)
         WHERE uuid = $4
         RETURNING *`,
        [name || null, ip || null, system_info || null, uuid]
      );

      await invalidateCache(CACHE_KEYS.DEVICES + '*');
      return res.json({ device: upd.rows[0], claimed: true });
    }

    // Create new device row with provided UUID
    const ins = await pool.query(
      `INSERT INTO devices (uuid, name, ip, status, last_ping, system_info)
       VALUES ($1, $2, $3, 'online', NOW(), $4)
       RETURNING *`,
      [uuid, name || 'Device', ip || 'unknown', system_info || null]
    );

    await invalidateCache(CACHE_KEYS.DEVICES + '*');
    return res.status(201).json({ device: ins.rows[0], claimed: false, created: true });
  } catch (error) {
    console.error('Error claiming device by uuid:', error);
    return res.status(500).json({ error: 'Failed to claim device' });
  }
});

export default router;