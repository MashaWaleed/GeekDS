-- ============================================================================
-- DRY RUN VERIFICATION
-- ============================================================================
-- This script shows what the migration will do WITHOUT making any changes.
-- Run this to preview the migration impact before running the actual migration.
-- ============================================================================

\echo '=================================================='
\echo 'DRY RUN - Migration Preview (NO CHANGES MADE)'
\echo '=================================================='
\echo ''

-- Check if pgcrypto extension exists
\echo '1. pgcrypto Extension Status:'
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '   ✓ Already installed'
        ELSE '   ⚠ Will be installed'
    END as status
FROM pg_extension 
WHERE extname = 'pgcrypto';

\echo ''
\echo '2. Current devices table structure:'
\d devices

\echo ''
\echo '3. UUID Column Status:'
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN '   ⚠ UUID column already exists'
        ELSE '   ✓ UUID column will be added'
    END as status
FROM information_schema.columns 
WHERE table_name = 'devices' AND column_name = 'uuid';

\echo ''
\echo '4. Current Device Count:'
SELECT COUNT(*) as total_devices FROM devices;

\echo ''
\echo '5. Devices that will receive UUIDs:'
SELECT 
    id,
    name,
    ip,
    status,
    'Will receive new UUID' as uuid_status
FROM devices
ORDER BY id;

\echo ''
\echo '6. Related Data (will NOT be modified):'
SELECT 
    (SELECT COUNT(*) FROM schedules) as schedules,
    (SELECT COUNT(*) FROM playlists) as playlists,
    (SELECT COUNT(*) FROM media_files) as media_files,
    (SELECT COUNT(*) FROM folders) as folders;

\echo ''
\echo '7. Indexes that will be created:'
\echo '   - devices_uuid_key (UNIQUE on uuid)'
\echo '   - idx_devices_ip (on ip)'
\echo '   - idx_devices_status (on status)'
\echo '   - idx_devices_last_ping (on last_ping)'
\echo '   - idx_device_commands_dev_status (on device_id, status)'
\echo '   - idx_device_commands_created (on created_at)'
\echo '   - idx_schedules_device (on device_id)'
\echo '   - idx_schedules_device_time (on device_id, time_slot_start, time_slot_end)'
\echo '   - idx_schedules_days (GIN on days_of_week)'
\echo '   - idx_screenshot_requests_dev_status (on device_id, status)'
\echo '   - idx_screenshot_requests_dev_time (on device_id, requested_at DESC)'
\echo '   - idx_screenshot_requests_device_status (on device_id, status)'
\echo '   - idx_screenshot_requests_requested_at (on requested_at)'

\echo ''
\echo '8. Existing Indexes (will be preserved):'
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename IN ('devices', 'schedules', 'playlists', 'device_commands', 'screenshot_requests')
ORDER BY tablename, indexname;

\echo ''
\echo '9. Foreign Key Relationships (will be preserved):'
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('devices', 'schedules', 'playlists', 'device_commands')
ORDER BY tc.table_name;

\echo ''
\echo '=================================================='
\echo 'DRY RUN COMPLETE'
\echo '=================================================='
\echo ''
\echo 'Summary of Changes:'
\echo '  - Tables Modified: devices (add uuid column)'
\echo '  - Tables Unchanged: schedules, playlists, media_files, folders'
\echo '  - Data Deleted: NONE'
\echo '  - Data Modified: NONE (only adding uuid values)'
\echo '  - Indexes Added: ~13 performance indexes'
\echo '  - Constraints Added: 1 unique constraint (uuid)'
\echo ''
\echo 'Risk Assessment: LOW'
\echo '  ✓ No data deletion'
\echo '  ✓ No foreign key changes'
\echo '  ✓ Idempotent (safe to re-run)'
\echo '  ✓ Transactional (all-or-nothing)'
\echo '  ✓ Automatic verification'
\echo ''
\echo 'To proceed with migration, run:'
\echo '  ./migrate_database.sh'
\echo ''
\echo 'Or manually:'
\echo '  docker exec -i geekds-db-1 psql -U postgres -d cms < migration_add_uuid.sql'
\echo ''
