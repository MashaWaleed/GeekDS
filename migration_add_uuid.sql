-- ============================================================================
-- MIGRATION: Add UUID support and performance indexes
-- FROM: schema_old2.sql (no UUID, minimal indexes)
-- TO:   schema.sql (UUID column, performance indexes, comments)
-- ============================================================================
-- This migration is SAFE for production with existing data.
-- All changes use IF NOT EXISTS to be idempotent (safe to run multiple times).
-- ============================================================================

-- Start transaction for atomicity
-- ============================================================================
-- MIGRATION: Add UUID support and performance indexes
-- FROM: schema_old2.sql (no UUID, minimal indexes)
-- TO:   schema.sql (UUID column, performance indexes, comments)
-- ============================================================================
-- This migration is SAFE for production with existing data.
-- All changes use IF NOT EXISTS to be idempotent (safe to run multiple times).
-- ============================================================================

-- STEP 1: Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- STEP 2: Add UUID column to devices table (nullable first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'uuid'
    ) THEN
        ALTER TABLE devices ADD COLUMN uuid UUID;
    END IF;
END $$;

-- STEP 3: Generate UUIDs for existing devices
UPDATE devices 
SET uuid = gen_random_uuid() 
WHERE uuid IS NULL;

-- STEP 4: Make UUID column NOT NULL with default
ALTER TABLE devices ALTER COLUMN uuid SET NOT NULL;
ALTER TABLE devices ALTER COLUMN uuid SET DEFAULT gen_random_uuid();

-- STEP 5: Add unique index on UUID
CREATE UNIQUE INDEX IF NOT EXISTS devices_uuid_key ON devices(uuid);

-- STEP 6: Add performance indexes
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_ping ON devices(last_ping);
CREATE INDEX IF NOT EXISTS idx_device_commands_dev_status ON device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON device_commands(created_at);
CREATE INDEX IF NOT EXISTS idx_schedules_device ON schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_schedules_device_time ON schedules(device_id, time_slot_start, time_slot_end);
CREATE INDEX IF NOT EXISTS idx_schedules_days ON schedules USING gin(days_of_week);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_status ON screenshot_requests(device_id, status);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_time ON screenshot_requests(device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_device_status ON screenshot_requests(device_id, status);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_requested_at ON screenshot_requests(requested_at);

-- STEP 7: Add table and column comments (documentation)
COMMENT ON TABLE screenshot_requests IS 'Tracks screenshot requests from devices with status and results';
COMMENT ON COLUMN screenshot_requests.screenshot_filename IS 'Filename of uploaded screenshot (when status=completed)';
COMMENT ON COLUMN screenshot_requests.error_message IS 'Error details when status=failed';

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES (run manually)
-- ============================================================================
-- 1. Check devices table structure:
--    \d devices
-- 2. Verify all devices have UUIDs:
--    SELECT COUNT(*) as total_devices, COUNT(uuid) as devices_with_uuid FROM devices;
-- 3. View devices with their UUIDs:
--    SELECT id, name, ip, uuid FROM devices ORDER BY id;
-- 4. Check indexes created:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'devices';
-- 5. Verify UUID uniqueness:
--    SELECT uuid, COUNT(*) FROM devices GROUP BY uuid HAVING COUNT(*) > 1;
--    (Should return 0 rows)
-- ============================================================================
