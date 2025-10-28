# Migration Testing & Verification Guide

## Pre-Migration Checklist

### 1. Backup Current Database (MANDATORY!)
```bash
cd ~/GeekDS
docker exec geekds-db-1 pg_dump -U postgres cms > backup_before_uuid_migration_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file exists and has content
ls -lh backup_*.sql
wc -l backup_*.sql  # Should have hundreds/thousands of lines
```

### 2. Check Current Database State
```bash
# Count existing devices
docker exec -i geekds-db-1 psql -U postgres -d cms -c "SELECT COUNT(*) as device_count FROM devices;"

# Check if uuid column already exists (should be NO)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "\d devices" | grep uuid

# Count schedules (to verify nothing is lost)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "SELECT COUNT(*) as schedule_count FROM schedules;"

# Count playlists (to verify nothing is lost)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "SELECT COUNT(*) as playlist_count FROM playlists;"

# Count media files (to verify nothing is lost)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "SELECT COUNT(*) as media_count FROM media_files;"
```

### 3. Record Pre-Migration Counts
```bash
# Save current state for comparison
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    (SELECT COUNT(*) FROM devices) as devices,
    (SELECT COUNT(*) FROM schedules) as schedules,
    (SELECT COUNT(*) FROM playlists) as playlists,
    (SELECT COUNT(*) FROM media_files) as media_files,
    (SELECT COUNT(*) FROM folders) as folders;
" > pre_migration_counts.txt

cat pre_migration_counts.txt
```

---

## Migration Execution

### Step 1: Apply Migration SQL
```bash
cd ~/GeekDS

# Apply the migration
docker exec -i geekds-db-1 psql -U postgres -d cms < migration_add_uuid.sql
```

**Expected Output:**
```
BEGIN
NOTICE:  extension "pgcrypto" already exists, skipping
NOTICE:  ✓ Step 1/6: pgcrypto extension enabled
NOTICE:  ✓ Step 2/6: Added uuid column to devices table
NOTICE:  ✓ Step 3/6: Generated UUIDs for X existing device(s)
NOTICE:  ✓ Step 4/6: Set uuid column to NOT NULL with default
NOTICE:  ✓ Step 5/6: Created unique index on uuid
NOTICE:  ✓ Step 6/6: Created performance indexes
NOTICE:  ✓ Step 7/7: Added documentation comments
NOTICE:  
NOTICE:  ============================================================
NOTICE:  MIGRATION COMPLETED SUCCESSFULLY!
NOTICE:  ============================================================
NOTICE:  Devices migrated: X
NOTICE:  UUIDs generated: X
NOTICE:  All devices have unique UUIDs: YES
NOTICE:  Performance indexes created: YES
NOTICE:  ============================================================
COMMIT
```

### Step 2: Immediate Verification
```bash
# Check devices table structure (should show uuid column)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "\d devices"
```

**Expected Output Should Include:**
```
 uuid                   | uuid    | not null | gen_random_uuid()
```

---

## Post-Migration Verification

### 1. Verify UUID Column
```bash
# Check all devices have UUIDs
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    COUNT(*) as total_devices, 
    COUNT(uuid) as devices_with_uuid,
    COUNT(DISTINCT uuid) as unique_uuids
FROM devices;"
```

**Expected:** All three counts should be THE SAME number

### 2. View Devices with UUIDs
```bash
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT id, name, ip, 
       LEFT(uuid::text, 8) || '...' as uuid_prefix 
FROM devices 
ORDER BY id;"
```

**Expected:** Every device has a UUID (no NULL values)

### 3. Verify No Data Loss
```bash
# Compare counts with pre-migration
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    (SELECT COUNT(*) FROM devices) as devices,
    (SELECT COUNT(*) FROM schedules) as schedules,
    (SELECT COUNT(*) FROM playlists) as playlists,
    (SELECT COUNT(*) FROM media_files) as media_files,
    (SELECT COUNT(*) FROM folders) as folders;
"
```

**Expected:** ALL counts should match pre_migration_counts.txt EXACTLY

### 4. Verify Indexes Created
```bash
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE 'idx_%' OR indexname LIKE 'devices_uuid%')
ORDER BY tablename, indexname;"
```

**Expected Indexes:**
```
devices               | devices_uuid_key
devices               | idx_devices_ip
devices               | idx_devices_last_ping
devices               | idx_devices_status
device_commands       | idx_device_commands_created
device_commands       | idx_device_commands_dev_status
schedules             | idx_schedules_days
schedules             | idx_schedules_device
schedules             | idx_schedules_device_time
screenshot_requests   | idx_screenshot_requests_dev_status
screenshot_requests   | idx_screenshot_requests_dev_time
screenshot_requests   | idx_screenshot_requests_device_status
screenshot_requests   | idx_screenshot_requests_requested_at
```

### 5. Verify UUID Uniqueness
```bash
# Check for duplicate UUIDs (should return 0 rows)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT uuid, COUNT(*) as duplicate_count
FROM devices 
GROUP BY uuid 
HAVING COUNT(*) > 1;"
```

**Expected:** `(0 rows)` - No duplicates

### 6. Test UUID Generation for New Devices
```bash
# Insert a test device (should auto-generate UUID)
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
INSERT INTO devices (name, ip, status, last_ping, system_info)
VALUES ('TEST-DEVICE', '192.168.1.99', 'offline', NOW(), '{\"test\": true}'::jsonb)
RETURNING id, name, uuid;"
```

**Expected:** Returns new device with automatically generated UUID

```bash
# Clean up test device
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
DELETE FROM devices WHERE name = 'TEST-DEVICE';"
```

### 7. Verify Schedules Still Work
```bash
# Check schedule-device relationships intact
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT s.id, s.name, d.name as device_name, p.name as playlist_name
FROM schedules s
JOIN devices d ON s.device_id = d.id
JOIN playlists p ON s.playlist_id = p.id
LIMIT 5;"
```

**Expected:** Shows schedules with device and playlist names (no broken relationships)

---

## Rollback Procedure (Only if migration fails)

### If Migration Failed:
```bash
# Stop containers
docker compose down

# Restore from backup
docker compose up -d db
sleep 10

# Find your backup file
ls -lh backup_*.sql

# Restore it
docker exec -i geekds-db-1 psql -U postgres -d cms < backup_before_uuid_migration_YYYYMMDD_HHMMSS.sql

# Restart services
docker compose up -d
```

---

## Success Criteria

✅ **Migration is successful if ALL of these are true:**

1. ✅ Migration SQL completes without errors
2. ✅ All devices have UUIDs (COUNT(*) = COUNT(uuid))
3. ✅ All UUIDs are unique (no duplicates)
4. ✅ Device count matches pre-migration count
5. ✅ Schedule count matches pre-migration count
6. ✅ Playlist count matches pre-migration count
7. ✅ Media files count matches pre-migration count
8. ✅ All indexes created successfully
9. ✅ `\d devices` shows uuid column with NOT NULL constraint
10. ✅ New device insertion auto-generates UUID

---

## Common Issues & Solutions

### Issue: "column uuid already exists"
**Solution:** Migration is idempotent - it will skip adding the column and continue

### Issue: "MIGRATION FAILED: Not all devices have UUIDs"
**Cause:** UPDATE statement didn't generate UUIDs
**Solution:** Run manually:
```bash
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
UPDATE devices SET uuid = gen_random_uuid() WHERE uuid IS NULL;"
```

### Issue: Migration hangs or times out
**Cause:** Large number of devices or locks
**Solution:** 
1. Check for locks: `SELECT * FROM pg_locks WHERE NOT granted;`
2. Stop other queries/connections
3. Retry migration

---

## Final Verification Script

Run this comprehensive check after migration:

```bash
#!/bin/bash
echo "=== POST-MIGRATION VERIFICATION ==="
echo ""

echo "1. UUID Column Check:"
docker exec -i geekds-db-1 psql -U postgres -d cms -c "\d devices" | grep uuid
echo ""

echo "2. Device UUID Coverage:"
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    COUNT(*) as total,
    COUNT(uuid) as with_uuid,
    COUNT(DISTINCT uuid) as unique_uuids,
    CASE 
        WHEN COUNT(*) = COUNT(uuid) AND COUNT(*) = COUNT(DISTINCT uuid) 
        THEN '✓ PASS' 
        ELSE '✗ FAIL' 
    END as status
FROM devices;"
echo ""

echo "3. Data Counts (compare with backup):"
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    (SELECT COUNT(*) FROM devices) as devices,
    (SELECT COUNT(*) FROM schedules) as schedules,
    (SELECT COUNT(*) FROM playlists) as playlists,
    (SELECT COUNT(*) FROM media_files) as media
;"
echo ""

echo "4. Index Count:"
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT COUNT(*) as performance_indexes_created
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND (indexname LIKE 'idx_%' OR indexname = 'devices_uuid_key');"
echo ""

echo "5. UUID Duplicates Check:"
DUPES=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "
SELECT COUNT(*) FROM (
    SELECT uuid FROM devices GROUP BY uuid HAVING COUNT(*) > 1
) dupes;")

if [ "$DUPES" -eq 0 ]; then
    echo "✓ PASS - No duplicate UUIDs"
else
    echo "✗ FAIL - Found $DUPES duplicate UUIDs"
fi
echo ""

echo "=== VERIFICATION COMPLETE ==="
```

Save as `verify_migration.sh`, make executable, and run:
```bash
chmod +x verify_migration.sh
./verify_migration.sh
```

---

## Next Steps After Successful Migration

1. ✅ Copy schema.sql to cms_schema.sql:
   ```bash
   cp schema.sql cms_schema.sql
   ```

2. ✅ Commit migration to git:
   ```bash
   git add migration_add_uuid.sql cms_schema.sql
   git commit -m "Add UUID support to devices table with migration"
   git push
   ```

3. ✅ Update backend code (if needed):
   - Backend should now return `uuid` field in device responses
   - Android app will use this UUID for registration

4. ✅ Monitor devices after restart:
   ```bash
   docker compose logs -f backend | grep -i uuid
   ```

5. ✅ Keep backup for 7+ days before deleting
