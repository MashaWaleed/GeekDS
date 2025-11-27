#!/bin/bash

# =============================================================================
# SAFE DATABASE MIGRATION - UUID Support
# =============================================================================
# This script safely migrates your GeekDS database to add UUID support
# while preserving all existing data (devices, schedules, playlists, media)
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    print_error "Error: docker-compose.yml not found!"
    print_error "Please run this script from the GeekDS project directory"
    exit 1
fi

if [ ! -f "migration_add_uuid.sql" ]; then
    print_error "Error: migration_add_uuid.sql not found!"
    print_error "Please ensure the migration file exists in the current directory"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         GeekDS Database Migration - UUID Support         ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Backup
print_step "Step 1/8: Creating database backup..."
BACKUP_FILE="backup_before_uuid_migration_$(date +%Y%m%d_%H%M%S).sql"
docker exec geekds-db-1 pg_dump -U postgres cms > "$BACKUP_FILE" 2>&1

if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(wc -l < "$BACKUP_FILE")
    print_success "Backup created: $BACKUP_FILE ($BACKUP_SIZE lines)"
else
    print_error "Failed to create backup!"
    exit 1
fi

# Step 2: Record pre-migration state
print_step "Step 2/8: Recording current database state..."
docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "
SELECT 
    (SELECT COUNT(*) FROM devices) as devices,
    (SELECT COUNT(*) FROM schedules) as schedules,
    (SELECT COUNT(*) FROM playlists) as playlists,
    (SELECT COUNT(*) FROM media_files) as media_files
" > pre_migration_counts.txt 2>&1

# Parse counts
PRE_DEVICES=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM devices" | tr -d ' ')
PRE_SCHEDULES=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM schedules" | tr -d ' ')
PRE_PLAYLISTS=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM playlists" | tr -d ' ')
PRE_MEDIA=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM media_files" | tr -d ' ')

echo "   Devices: $PRE_DEVICES"
echo "   Schedules: $PRE_SCHEDULES"
echo "   Playlists: $PRE_PLAYLISTS"
echo "   Media Files: $PRE_MEDIA"

# Step 3: Check if migration already applied
print_step "Step 3/8: Checking if migration already applied..."
UUID_EXISTS=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "
SELECT COUNT(*) FROM information_schema.columns 
WHERE table_name = 'devices' AND column_name = 'uuid'
" | tr -d ' ')

if [ "$UUID_EXISTS" -gt 0 ]; then
    print_warning "UUID column already exists! Migration may have been applied before."
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Migration cancelled by user"
        exit 0
    fi
else
    print_success "Database ready for migration"
fi

# Step 4: Apply migration
print_step "Step 4/8: Applying migration SQL..."
if docker exec -i geekds-db-1 psql -U postgres -d cms < migration_add_uuid.sql > migration_output.log 2>&1; then
    print_success "Migration SQL executed successfully"
    
    # Show migration summary
    if grep -q "MIGRATION COMPLETED SUCCESSFULLY" migration_output.log; then
        print_success "Migration verification passed"
    else
        print_warning "Migration executed but verification unclear - check migration_output.log"
    fi
else
    print_error "Migration failed! Check migration_output.log for details"
    print_warning "Database backup available at: $BACKUP_FILE"
    exit 1
fi

# Step 5: Verify UUID column
print_step "Step 5/8: Verifying UUID column..."
if docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "\d devices" | grep -q "uuid.*uuid.*not null"; then
    print_success "UUID column verified (type: uuid, not null: yes)"
else
    print_error "UUID column verification failed!"
    exit 1
fi

# Step 6: Verify data integrity
print_step "Step 6/8: Verifying data integrity..."
POST_DEVICES=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM devices" | tr -d ' ')
POST_SCHEDULES=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM schedules" | tr -d ' ')
POST_PLAYLISTS=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM playlists" | tr -d ' ')
POST_MEDIA=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM media_files" | tr -d ' ')

ALL_MATCH=true

if [ "$PRE_DEVICES" != "$POST_DEVICES" ]; then
    print_error "Device count mismatch! Before: $PRE_DEVICES, After: $POST_DEVICES"
    ALL_MATCH=false
fi

if [ "$PRE_SCHEDULES" != "$POST_SCHEDULES" ]; then
    print_error "Schedule count mismatch! Before: $PRE_SCHEDULES, After: $POST_SCHEDULES"
    ALL_MATCH=false
fi

if [ "$PRE_PLAYLISTS" != "$POST_PLAYLISTS" ]; then
    print_error "Playlist count mismatch! Before: $PRE_PLAYLISTS, After: $POST_PLAYLISTS"
    ALL_MATCH=false
fi

if [ "$PRE_MEDIA" != "$POST_MEDIA" ]; then
    print_error "Media count mismatch! Before: $PRE_MEDIA, After: $POST_MEDIA"
    ALL_MATCH=false
fi

if [ "$ALL_MATCH" = true ]; then
    print_success "All data counts match (no data loss)"
    echo "   Devices: $POST_DEVICES"
    echo "   Schedules: $POST_SCHEDULES"
    echo "   Playlists: $POST_PLAYLISTS"
    echo "   Media Files: $POST_MEDIA"
else
    print_error "Data integrity check failed!"
    print_warning "You can restore from backup: $BACKUP_FILE"
    exit 1
fi

# Step 7: Verify all devices have UUIDs
print_step "Step 7/8: Verifying UUID coverage..."
DEVICES_WITH_UUID=$(docker exec -i geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM devices WHERE uuid IS NOT NULL" | tr -d ' ')

if [ "$POST_DEVICES" = "$DEVICES_WITH_UUID" ]; then
    print_success "All $POST_DEVICES devices have UUIDs"
else
    print_error "Some devices missing UUIDs! Total: $POST_DEVICES, With UUID: $DEVICES_WITH_UUID"
    exit 1
fi

# Step 8: Update schema file
print_step "Step 8/8: Updating cms_schema.sql..."
if [ -f "schema.sql" ]; then
    cp schema.sql cms_schema.sql
    print_success "cms_schema.sql updated with new schema"
else
    print_warning "schema.sql not found - skipping cms_schema.sql update"
fi

# Success summary
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              MIGRATION COMPLETED SUCCESSFULLY             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
print_success "Database migrated successfully"
print_success "Backup saved: $BACKUP_FILE"
print_success "All data preserved ($POST_DEVICES devices, $POST_SCHEDULES schedules, $POST_PLAYLISTS playlists)"
print_success "All devices have UUIDs"
echo ""
echo "Next steps:"
echo "  1. Restart services: docker compose restart backend frontend"
echo "  2. Test device registration with UUID support"
echo "  3. Monitor logs: docker compose logs -f backend"
echo "  4. Keep backup file for 7+ days: $BACKUP_FILE"
echo ""
print_success "Migration complete! Your database is ready."
echo ""
