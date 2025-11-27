# Database Migration - Complete Guide

## 📋 What This Migration Does

This migration adds **UUID support** to your GeekDS database while **preserving all existing data**.

### Changes Applied:
1. ✅ Adds `pgcrypto` extension (for UUID generation)
2. ✅ Adds `uuid` column to `devices` table
3. ✅ Generates unique UUIDs for all existing devices
4. ✅ Creates unique index on UUID
5. ✅ Adds performance indexes (faster queries)
6. ✅ Adds documentation comments

### What Is NOT Changed:
- ❌ No devices deleted
- ❌ No schedules modified
- ❌ No playlists modified
- ❌ No media files affected
- ❌ No existing columns changed

---

## 🚀 Quick Start (Automated Migration)

### On Your Remote Server:

```bash
# 1. Navigate to project directory
cd ~/GeekDS

# 2. Pull latest code with migration files
git pull origin main

# 3. Run automated migration script
./migrate_database.sh
```

**That's it!** The script will:
- ✅ Create backup automatically
- ✅ Apply migration safely
- ✅ Verify all data intact
- ✅ Show success/failure clearly

---

## 📝 Manual Migration (If You Prefer)

### Step-by-Step Commands:

```bash
cd ~/GeekDS

# 1. BACKUP (MANDATORY!)
docker exec geekds-db-1 pg_dump -U postgres cms > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Apply migration
docker exec -i geekds-db-1 psql -U postgres -d cms < migration_add_uuid.sql

# 3. Verify success
docker exec -i geekds-db-1 psql -U postgres -d cms -c "\d devices" | grep uuid

# 4. Check all devices have UUIDs
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT COUNT(*) as total, COUNT(uuid) as with_uuid FROM devices;"

# 5. Update schema file
cp schema.sql cms_schema.sql

# 6. Restart services
docker compose restart backend frontend
```

---

## ✅ Verification Checklist

After migration, verify these conditions:

```bash
# All devices have UUIDs
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT 
    COUNT(*) as total_devices,
    COUNT(uuid) as devices_with_uuid,
    CASE WHEN COUNT(*) = COUNT(uuid) THEN '✓ PASS' ELSE '✗ FAIL' END
FROM devices;"
```

**Expected:** `total_devices = devices_with_uuid` and `✓ PASS`

```bash
# No duplicate UUIDs
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT uuid, COUNT(*) FROM devices GROUP BY uuid HAVING COUNT(*) > 1;"
```

**Expected:** `(0 rows)`

```bash
# View devices with UUIDs
docker exec -i geekds-db-1 psql -U postgres -d cms -c "
SELECT id, name, LEFT(uuid::text, 13) || '...' as uuid FROM devices LIMIT 5;"
```

**Expected:** Every device shows a UUID

---

## 🛡️ Safety Features

### 1. **Idempotent** (Safe to Run Multiple Times)
```sql
CREATE INDEX IF NOT EXISTS ...
ALTER TABLE IF NOT EXISTS ...
```
If migration fails halfway, just run it again!

### 2. **Transactional** (All or Nothing)
```sql
BEGIN;
  -- All changes here
COMMIT;
```
If ANY step fails, ALL changes are rolled back.

### 3. **Automatic Verification**
```sql
DO $$
BEGIN
    IF device_count != uuid_count THEN
        RAISE EXCEPTION 'MIGRATION FAILED!';
    END IF;
END $$;
```
Migration will FAIL LOUDLY if something is wrong.

### 4. **Backup Created First**
Always creates timestamped backup before touching database.

---

## 🔄 Rollback (If Needed)

If migration fails or causes issues:

```bash
# 1. Find your backup
ls -lh backup_*.sql

# 2. Stop containers
docker compose down

# 3. Start only database
docker compose up -d db
sleep 10

# 4. Restore backup
docker exec -i geekds-db-1 psql -U postgres -d cms < backup_before_uuid_migration_YYYYMMDD_HHMMSS.sql

# 5. Restart all services
docker compose up -d
```

---

## 📊 Migration Output

### Successful Migration Shows:
```
BEGIN
NOTICE:  ✓ Step 1/6: pgcrypto extension enabled
NOTICE:  ✓ Step 2/6: Added uuid column to devices table
NOTICE:  ✓ Step 3/6: Generated UUIDs for 3 existing device(s)
NOTICE:  ✓ Step 4/6: Set uuid column to NOT NULL with default
NOTICE:  ✓ Step 5/6: Created unique index on uuid
NOTICE:  ✓ Step 6/6: Created performance indexes
NOTICE:  ✓ Step 7/7: Added documentation comments
NOTICE:  
NOTICE:  ============================================================
NOTICE:  MIGRATION COMPLETED SUCCESSFULLY!
NOTICE:  ============================================================
NOTICE:  Devices migrated: 3
NOTICE:  UUIDs generated: 3
NOTICE:  All devices have unique UUIDs: YES
NOTICE:  Performance indexes created: YES
NOTICE:  ============================================================
COMMIT
```

### Failed Migration Shows:
```
ERROR:  MIGRATION FAILED: Not all devices have UUIDs!
```
(Will automatically rollback, no changes applied)

---

## 🎯 What Happens to Existing Devices

### Before Migration:
```sql
 id |     name      |      ip       | status  | uuid
----+---------------+---------------+---------+------
  1 | Device-Alpha  | 192.168.1.5   | online  | NULL
  2 | Device-Beta   | 192.168.1.7   | online  | NULL
  3 | ARC-A-GR-18   | 192.168.1.8   | online  | NULL
```

### After Migration:
```sql
 id |     name      |      ip       | status  |                 uuid
----+---------------+---------------+---------+--------------------------------------
  1 | Device-Alpha  | 192.168.1.5   | online  | a1b2c3d4-e5f6-4789-a012-bcdef0123456
  2 | Device-Beta   | 192.168.1.7   | online  | b2c3d4e5-f6a7-4890-b123-cdef01234567
  3 | ARC-A-GR-18   | 192.168.1.8   | online  | c3d4e5f6-a7b8-4901-c234-def012345678
```

**Key Points:**
- ✅ Same device IDs
- ✅ Same names
- ✅ Same IPs
- ✅ New UUID column added
- ✅ Every device gets unique UUID
- ✅ All relationships (schedules, playlists) preserved

---

## 📦 Files Created

### 1. `migration_add_uuid.sql`
- **Size:** ~6 KB
- **Purpose:** SQL commands to add UUID support
- **Safety:** Idempotent, transactional, with verification

### 2. `migrate_database.sh`
- **Size:** ~8 KB
- **Purpose:** Automated migration script
- **Features:** Backup, verify, rollback support

### 3. `MIGRATION_TEST_GUIDE.md`
- **Size:** ~15 KB
- **Purpose:** Comprehensive testing guide
- **Includes:** Pre/post checks, verification queries

### 4. `README_MIGRATION.md` (this file)
- **Size:** ~5 KB
- **Purpose:** Quick reference guide

---

## ⏱️ Migration Time Estimate

| Devices | Migration Time |
|---------|----------------|
| 1-10    | < 1 second     |
| 10-100  | 1-2 seconds    |
| 100-1000| 2-5 seconds    |
| 1000+   | 5-10 seconds   |

**Downtime:** ~0 seconds (database stays online during migration)

---

## ❓ FAQ

### Q: Will this delete my devices?
**A:** No! Migration only ADDS a column, never deletes data.

### Q: Will schedules be affected?
**A:** No! Schedules are completely untouched.

### Q: What if migration fails?
**A:** It will automatically rollback (no changes applied). You still have your backup.

### Q: Can I run this multiple times?
**A:** Yes! It's idempotent (safe to re-run).

### Q: What if I already have a uuid column?
**A:** Migration will skip adding it and continue with other steps.

### Q: How do I know it worked?
**A:** Look for "MIGRATION COMPLETED SUCCESSFULLY" message.

### Q: What about the Android app?
**A:** App already generates hardware-based UUIDs. After migration, devices will register using UUID instead of IP.

---

## 🎉 Post-Migration

### What Changes for Devices:

**Before Migration:**
- Device registers using IP address
- IP can change (DHCP)
- Device might re-register if IP changes

**After Migration:**
- Device registers using hardware UUID
- UUID never changes (hardware-based)
- Device keeps same identity even if IP changes

### Backend API Changes:

All device responses now include `uuid` field:

```json
{
  "id": 1,
  "name": "Device-Alpha",
  "ip": "192.168.1.5",
  "status": "online",
  "uuid": "a1b2c3d4-e5f6-4789-a012-bcdef0123456"
}
```

---

## 📞 Support

If you encounter issues:

1. **Check migration_output.log** (created by script)
2. **Check backup_*.sql exists** (your safety net)
3. **Verify database is running:** `docker ps | grep db`
4. **Check logs:** `docker compose logs db | tail -50`

---

## ✨ Summary

**One Command Migration:**
```bash
./migrate_database.sh
```

**Result:**
- ✅ UUID support added
- ✅ All data preserved
- ✅ Backup created
- ✅ Fully verified
- ✅ Ready for UUID-based registration

**Time Required:** < 1 minute
**Risk Level:** Very Low (backup + rollback available)
**Data Loss:** None (100% preserved)

---

**You're ready to migrate! 🚀**
