import { Router } from 'express';
import { pool } from './models';

const router = Router();

// --- REMOVED: Flawed GMT+3 offset utilities. ---
// Relying on standard ISO 8601 format and letting the database driver
// handle UTC conversion is the correct and more robust approach.

// List all schedules
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, 
              d.name as device_name, 
              p.name as playlist_name,
              s.updated_at as schedule_updated_at,
              p.updated_at as playlist_updated_at
       FROM schedules s
       LEFT JOIN devices d ON s.device_id = d.id
       LEFT JOIN playlists p ON s.playlist_id = p.id
       ORDER BY s.device_id, s.time_slot_start`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Create a new schedule
router.post('/', async (req, res) => {
  try {
    const { 
      device_id, 
      playlist_id, 
      name,
      days_of_week,
      time_slot_start,
      time_slot_end,
      valid_from,
      valid_until,
      is_enabled = true
    } = req.body;

    if (!device_id || !playlist_id || !time_slot_start || !time_slot_end || !days_of_week) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate time slots (24h format "HH:mm")
    if (time_slot_start >= time_slot_end) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Validate days of week
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!days_of_week.every((day: string) => validDays.includes(day))) {
      return res.status(400).json({ error: 'Invalid days of week' });
    }

    // If valid_from/valid_until provided, validate them
    if (valid_from && valid_until && new Date(valid_from) >= new Date(valid_until)) {
      return res.status(400).json({ error: 'Valid until must be after valid from' });
    }

    // Check for overlapping schedules
    const overlapCheck = await pool.query(
      `SELECT id, time_slot_start, time_slot_end, days_of_week 
       FROM schedules
       WHERE device_id = $1
       AND is_enabled = true
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       AND time_slot_start < $3
       AND time_slot_end > $2
       AND days_of_week && $4
       `,
      [device_id, time_slot_start, time_slot_end, days_of_week]
    );

    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Schedule overlaps with existing schedule(s)',
        overlapping_schedules: overlapCheck.rows
      });
    }

    const result = await pool.query(
      `INSERT INTO schedules (
        device_id, playlist_id, name, days_of_week,
        time_slot_start, time_slot_end,
        valid_from, valid_until, is_enabled, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *`,
      [
        device_id, playlist_id, name, days_of_week,
        time_slot_start, time_slot_end,
        valid_from || null, valid_until || null,
        is_enabled
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// Update schedule
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      device_id,
      playlist_id,
      name,
      days_of_week,
      time_slot_start,
      time_slot_end,
      valid_from,
      valid_until,
      is_enabled
    } = req.body;

    // To prevent race conditions and ensure data integrity, fetch the current state
    const currentScheduleResult = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    if (currentScheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    const currentSchedule = currentScheduleResult.rows[0];

    // Validate time slots if they're being updated
    if (time_slot_start && time_slot_end && time_slot_start >= time_slot_end) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Validate days of week if they're being updated
    if (days_of_week) {
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!days_of_week.every((day: string) => validDays.includes(day))) {
        return res.status(400).json({ error: 'Invalid days of week' });
      }
    }

    // If valid_from/valid_until provided, validate them
    if (valid_from && valid_until && new Date(valid_from) >= new Date(valid_until)) {
      return res.status(400).json({ error: 'Valid until must be after valid from' });
    }

    // Build the final object for the update
    const finalSchedule = {
      deviceId: device_id ?? currentSchedule.device_id,
      playlistId: playlist_id ?? currentSchedule.playlist_id,
      name: name ?? currentSchedule.name,
      daysOfWeek: days_of_week ?? currentSchedule.days_of_week,
      timeSlotStart: time_slot_start ?? currentSchedule.time_slot_start,
      timeSlotEnd: time_slot_end ?? currentSchedule.time_slot_end,
      validFrom: valid_from ?? currentSchedule.valid_from,
      validUntil: valid_until ?? currentSchedule.valid_until,
      isEnabled: is_enabled ?? currentSchedule.is_enabled
    };

    // Check for overlapping schedules
    const overlapCheck = await pool.query(
      `SELECT id, time_slot_start, time_slot_end, days_of_week 
       FROM schedules
       WHERE device_id = $1
       AND id != $2
       AND is_enabled = true
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       AND time_slot_start < $4
       AND time_slot_end > $3
       AND days_of_week && $5`,
      [finalSchedule.deviceId, id, finalSchedule.timeSlotStart, finalSchedule.timeSlotEnd, finalSchedule.daysOfWeek]
    );

    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({
        error: 'Schedule overlaps with existing schedule(s)',
        overlapping_schedules: overlapCheck.rows
      });
    }

    const result = await pool.query(
      `UPDATE schedules
       SET device_id = $1,
           playlist_id = $2,
           name = $3,
           days_of_week = $4,
           time_slot_start = $5,
           time_slot_end = $6,
           valid_from = $7,
           valid_until = $8,
           is_enabled = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        finalSchedule.deviceId,
        finalSchedule.playlistId,
        finalSchedule.name,
        finalSchedule.daysOfWeek,
        finalSchedule.timeSlotStart,
        finalSchedule.timeSlotEnd,
        finalSchedule.validFrom,
        finalSchedule.validUntil,
        finalSchedule.isEnabled,
        id
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json({ success: true, deleted_id: parseInt(id, 10) });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// Get schedules for a specific device (useful for debugging)
router.get('/device/:deviceId', async (req, res) => {
  // **FIX:** Declare deviceId outside the try block so it's accessible in the catch block.
  const { deviceId } = req.params;
  try {
    const result = await pool.query(
      'SELECT *, updated_at FROM schedules WHERE device_id = $1 ORDER BY start_time',
      [deviceId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching schedules for device ${deviceId}:`, error);
    res.status(500).json({ error: 'Failed to fetch schedules for device' });
  }
});

export default router;