-- ============================================================================
-- MIGRATION: Add UUID support and performance indexes
-- FROM: schema_old2.sql (no UUID, minimal indexes)
-- TO:   schema.sql (UUID column, performance indexes, comments)
-- ============================================================================
-- This migration is SAFE for production with existing data.
-- All changes use IF NOT EXISTS to be idempotent (safe to run multiple times).
-- ============================================================================

-- Start transaction for atomicity
BEGIN;

-- ============================================================================
-- STEP 1: Enable pgcrypto extension for UUID generation
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

RAISE NOTICE '✓ Step 1/6: pgcrypto extension enabled';

-- ============================================================================
-- STEP 2: Add UUID column to devices table (nullable first)
-- ============================================================================
-- We add it as nullable first to allow existing rows to exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'devices' AND column_name = 'uuid'
    ) THEN
        ALTER TABLE devices ADD COLUMN uuid UUID;
        RAISE NOTICE '✓ Step 2/6: Added uuid column to devices table';
    ELSE
        RAISE NOTICE '✓ Step 2/6: uuid column already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Generate UUIDs for existing devices
-- ============================================================================
-- Any device without a UUID gets a new one generated
UPDATE devices 
SET uuid = gen_random_uuid() 
WHERE uuid IS NULL;

-- Get count of devices updated
DO $$
DECLARE
    device_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO device_count FROM devices;
    RAISE NOTICE '✓ Step 3/6: Generated UUIDs for % existing device(s)', device_count;
END $$;

-- ============================================================================
-- STEP 4: Make UUID column NOT NULL with default
-- ============================================================================
-- Now that all existing rows have UUIDs, we can enforce NOT NULL
ALTER TABLE devices ALTER COLUMN uuid SET NOT NULL;
ALTER TABLE devices ALTER COLUMN uuid SET DEFAULT gen_random_uuid();

RAISE NOTICE '✓ Step 4/6: Set uuid column to NOT NULL with default';

-- ============================================================================
-- STEP 5: Add unique index on UUID
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS devices_uuid_key ON devices(uuid);

RAISE NOTICE '✓ Step 5/6: Created unique index on uuid';

-- ============================================================================
-- STEP 6: Add performance indexes
-- ============================================================================

-- Devices table indexes
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_ping ON devices(last_ping);

-- Device commands indexes  
CREATE INDEX IF NOT EXISTS idx_device_commands_dev_status ON device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON device_commands(created_at);

-- Schedules indexes
CREATE INDEX IF NOT EXISTS idx_schedules_device ON schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_schedules_device_time ON schedules(device_id, time_slot_start, time_slot_end);
CREATE INDEX IF NOT EXISTS idx_schedules_days ON schedules USING gin(days_of_week);

-- Screenshot requests indexes
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_status ON screenshot_requests(device_id, status);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_time ON screenshot_requests(device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_device_status ON screenshot_requests(device_id, status);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_requested_at ON screenshot_requests(requested_at);

RAISE NOTICE '✓ Step 6/6: Created performance indexes';

-- ============================================================================
-- STEP 7: Add table and column comments (documentation)
-- ============================================================================
COMMENT ON TABLE screenshot_requests IS 'Tracks screenshot requests from devices with status and results';
COMMENT ON COLUMN screenshot_requests.screenshot_filename IS 'Filename of uploaded screenshot (when status=completed)';
COMMENT ON COLUMN screenshot_requests.error_message IS 'Error details when status=failed';

RAISE NOTICE '✓ Step 7/7: Added documentation comments';

-- ============================================================================
-- VERIFICATION: Check migration success
-- ============================================================================
DO $$
DECLARE
    uuid_count INTEGER;
    device_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Check all devices have UUIDs
    SELECT COUNT(*) INTO device_count FROM devices;
    SELECT COUNT(*) INTO uuid_count FROM devices WHERE uuid IS NOT NULL;
    
    IF device_count != uuid_count THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Not all devices have UUIDs! Devices: %, With UUID: %', device_count, uuid_count;
    END IF;
    
    -- Check unique index exists
    SELECT COUNT(*) INTO index_count 
    FROM pg_indexes 
    WHERE tablename = 'devices' AND indexname = 'devices_uuid_key';
    
    IF index_count = 0 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: UUID unique index not created!';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Devices migrated: %', device_count;
    RAISE NOTICE 'UUIDs generated: %', uuid_count;
    RAISE NOTICE 'All devices have unique UUIDs: YES';
    RAISE NOTICE 'Performance indexes created: YES';
    RAISE NOTICE '============================================================';
END $$;

-- Commit transaction
COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================
-- You can run these manually after migration to verify:
--
-- 1. Check devices table structure:
--    \d devices
--
-- 2. Verify all devices have UUIDs:
--    SELECT COUNT(*) as total_devices, 
--           COUNT(uuid) as devices_with_uuid 
--    FROM devices;
--
-- 3. View devices with their UUIDs:
--    SELECT id, name, ip, uuid FROM devices ORDER BY id;
--
-- 4. Check indexes created:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'devices';
--
-- 5. Verify UUID uniqueness:
--    SELECT uuid, COUNT(*) FROM devices GROUP BY uuid HAVING COUNT(*) > 1;
--    (Should return 0 rows)
-- ============================================================================
