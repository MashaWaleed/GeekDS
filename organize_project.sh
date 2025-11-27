#!/bin/bash
# Project Organization Script
# Creates organized directory structure with timestamps

set -e

echo "🗂️  Organizing GeekDS Project..."
echo "================================"
echo ""

# Create base directories
mkdir -p docs/{guides,analysis,api,migration}
mkdir -p database/{migrations,schemas,scripts}
mkdir -p scripts/{deployment,testing,monitoring}
mkdir -p archive/old-migrations

# Move documentation files
echo "📚 Organizing documentation..."

# Guides
mv -f AUTHENTICATION.md docs/guides/ 2>/dev/null || true
mv -f MIGRATION_GUIDE.md docs/guides/ 2>/dev/null || true
mv -f PRODUCTION_SETUP.md docs/guides/ 2>/dev/null || true
mv -f UPDATE_TESTING_GUIDE.md docs/guides/ 2>/dev/null || true
mv -f DEVICE_OWNER_SETUP.md docs/guides/ 2>/dev/null || true
mv -f SYSTEM_APP_INSTALL.md docs/guides/ 2>/dev/null || true
mv -f UPDATE_WITHOUT_DEVICE_OWNER.md docs/guides/ 2>/dev/null || true
mv -f USERS.md docs/guides/ 2>/dev/null || true
mv -f CACHING_HOWTO.md docs/guides/ 2>/dev/null || true

# Analysis documents
mv -f ANALYSIS_SUMMARY.md docs/analysis/ 2>/dev/null || true
mv -f CACHE_TTL_ANALYSIS.md docs/analysis/ 2>/dev/null || true
mv -f RESOURCE_LIMITS_ANALYSIS.md docs/analysis/ 2>/dev/null || true
mv -f LOAD_TESTING.md docs/analysis/ 2>/dev/null || true
mv -f SCHEDULE_VERSION_DIAGRAM.md docs/analysis/ 2>/dev/null || true

# Implementation summaries
mv -f IMPLEMENTATION_SUMMARY.md docs/analysis/ 2>/dev/null || true
mv -f MIGRATION_SUMMARY.md docs/analysis/ 2>/dev/null || true
mv -f OPTIMIZATION_SUMMARY.md docs/analysis/ 2>/dev/null || true
mv -f UPLOAD_PROGRESS_IMPLEMENTATION.md docs/analysis/ 2>/dev/null || true

# Fix documentation
mv -f ANDROID_CONNECTION_FIX.md docs/analysis/ 2>/dev/null || true
mv -f ANDROID_RETRY_FIX.md docs/analysis/ 2>/dev/null || true
mv -f CACHING_REFACTOR.md docs/analysis/ 2>/dev/null || true
mv -f FIXES_APPLIED.md docs/analysis/ 2>/dev/null || true
mv -f LOAD_TEST_FIX.md docs/analysis/ 2>/dev/null || true
mv -f OFFLINE_FIRST_FIX.md docs/analysis/ 2>/dev/null || true
mv -f SCHEDULE_VERSION_FIX.md docs/analysis/ 2>/dev/null || true
mv -f UUID_REGISTRATION_FIX.md docs/analysis/ 2>/dev/null || true
mv -f REGISTRATION_COMPARISON.md docs/analysis/ 2>/dev/null || true
mv -f MIGRATION_TEST_GUIDE.md docs/analysis/ 2>/dev/null || true
mv -f README_MIGRATION.md docs/analysis/ 2>/dev/null || true

# API documentation
mv -f API.md docs/api/ 2>/dev/null || true

# Database files
echo "🗄️  Organizing database files..."

# Current migrations (timestamped)
mv -f add_app_version_to_devices.sql database/migrations/2024-11-19_add_app_version_and_update_requested.sql 2>/dev/null || true
mv -f add_uuid_to_devices.sql database/migrations/2024-11-18_add_uuid_to_devices.sql 2>/dev/null || true
mv -f create_users_table.sql database/migrations/2024-11-17_create_users_table.sql 2>/dev/null || true
mv -f create_all_users.sql database/migrations/2024-11-17_create_initial_users.sql 2>/dev/null || true
mv -f add_screenshot_requests.sql database/migrations/2024-11-16_add_screenshot_requests.sql 2>/dev/null || true
mv -f add_screenshot_requests_table.sql database/migrations/2024-11-16_add_screenshot_requests_alt.sql 2>/dev/null || true
mv -f add_folders.sql database/migrations/2024-11-15_add_folders.sql 2>/dev/null || true
mv -f add_folders_table.sql database/migrations/2024-11-15_add_folders_alt.sql 2>/dev/null || true
mv -f add_indexes.sql database/migrations/2024-11-14_add_indexes.sql 2>/dev/null || true
mv -f enhance_schedules.sql database/migrations/2024-11-13_enhance_schedules.sql 2>/dev/null || true
mv -f fix_screenshot_table.sql database/migrations/2024-11-12_fix_screenshot_table.sql 2>/dev/null || true
mv -f fix_timezone_updated_at.sql database/migrations/2024-11-12_fix_timezone_updated_at.sql 2>/dev/null || true

# Old/archived migrations
mv -f migration_add_uuid.sql archive/old-migrations/ 2>/dev/null || true
mv -f dry_run_migration.sql archive/old-migrations/ 2>/dev/null || true

# Schema files
mv -f schema.sql database/schemas/current_schema.sql 2>/dev/null || true
mv -f cms_schema.sql database/schemas/cms_schema_backup.sql 2>/dev/null || true
mv -f schema_old2.sql archive/schema_old2.sql 2>/dev/null || true

# Database scripts
mv -f migrate_database.sh database/scripts/ 2>/dev/null || true

# Scripts
echo "📜 Organizing scripts..."

# Deployment scripts
mv -f install-as-system-app.sh scripts/deployment/ 2>/dev/null || true
mv -f setup-device-owner.sh scripts/deployment/ 2>/dev/null || true
mv -f update_devices_adb.py scripts/deployment/ 2>/dev/null || true
mv -f add_api_imports.sh scripts/deployment/ 2>/dev/null || true

# Testing scripts
mv -f load-test.js scripts/testing/ 2>/dev/null || true
mv -f run-load-test.sh scripts/testing/ 2>/dev/null || true
mv -f start-load-test.sh scripts/testing/ 2>/dev/null || true

# Monitoring scripts
mv -f monitor.sh scripts/monitoring/ 2>/dev/null || true

# Archive old files
mv -f geekds_log.txt archive/ 2>/dev/null || true
mv -f app-debug.apk archive/ 2>/dev/null || true

# Create index files
echo "📋 Creating index files..."

cat > docs/README.md << 'DOCEOF'
# GeekDS Documentation

## 📚 Guides
User-facing guides and setup instructions:
- [Authentication Guide](guides/AUTHENTICATION.md)
- [Migration Guide](guides/MIGRATION_GUIDE.md)
- [Production Setup](guides/PRODUCTION_SETUP.md)
- [Update Testing Guide](guides/UPDATE_TESTING_GUIDE.md)
- [Device Owner Setup](guides/DEVICE_OWNER_SETUP.md)
- [System App Installation](guides/SYSTEM_APP_INSTALL.md)
- [Update Without Device Owner](guides/UPDATE_WITHOUT_DEVICE_OWNER.md)
- [User Management](guides/USERS.md)
- [Caching How-To](guides/CACHING_HOWTO.md)

## 🔬 Analysis & Technical Documents
In-depth analysis and implementation details:
- [Analysis Summary](analysis/ANALYSIS_SUMMARY.md)
- [Cache TTL Analysis](analysis/CACHE_TTL_ANALYSIS.md)
- [Resource Limits Analysis](analysis/RESOURCE_LIMITS_ANALYSIS.md)
- [Load Testing](analysis/LOAD_TESTING.md)
- [Implementation Summaries](analysis/)

## 🔧 Bug Fixes & Refactoring
Documentation of bugs fixed and refactoring done:
- [Android Connection Fix](analysis/ANDROID_CONNECTION_FIX.md)
- [Caching Refactor](analysis/CACHING_REFACTOR.md)
- [Schedule Version Fix](analysis/SCHEDULE_VERSION_FIX.md)
- [UUID Registration Fix](analysis/UUID_REGISTRATION_FIX.md)

## 📡 API Documentation
- [API Reference](api/API.md)

---
Last updated: 2024-11-19
DOCEOF

cat > database/README.md << 'DBEOF'
# GeekDS Database

## 📁 Directory Structure

### `/migrations/`
Timestamped SQL migration files in chronological order.
Apply in sequence for clean database setup.

**Format**: `YYYY-MM-DD_description.sql`

**Latest migrations**:
- `2024-11-19_add_app_version_and_update_requested.sql` - App version tracking & update system
- `2024-11-18_add_uuid_to_devices.sql` - Device UUID for stable identification
- `2024-11-17_create_users_table.sql` - Authentication system

### `/schemas/`
Complete database schema snapshots:
- `current_schema.sql` - Current production schema

### `/scripts/`
Database management scripts:
- `migrate_database.sh` - Run migrations

## 🚀 Quick Start

### Apply All Migrations
```bash
cd database/migrations
for file in *.sql; do
    docker exec -i geekds-db-1 psql -U postgres -d cms < "$file"
done
```

### Create Fresh Database
```bash
docker exec -i geekds-db-1 psql -U postgres -d cms < schemas/current_schema.sql
```

---
Last updated: 2024-11-19
DBEOF

cat > scripts/README.md << 'SCRIPTEOF'
# GeekDS Scripts

## 📁 Directory Structure

### `/deployment/`
Device setup and app deployment scripts:
- `install-as-system-app.sh` - Install GeekDS as system app (requires root)
- `setup-device-owner.sh` - Set app as Device Owner (requires factory reset)
- `update_devices_adb.py` - Batch update all devices via network ADB
- `add_api_imports.sh` - Add API imports to frontend components

### `/testing/`
Load testing and performance testing scripts:
- `load-test.js` - Artillery.io load test configuration
- `run-load-test.sh` - Run load tests
- `start-load-test.sh` - Start load test with logging

### `/monitoring/`
System monitoring and health check scripts:
- `monitor.sh` - System health monitoring

## 🚀 Usage

### Deploy to Device
```bash
cd deployment
./install-as-system-app.sh
```

### Run Load Tests
```bash
cd testing
./run-load-test.sh
```

---
Last updated: 2024-11-19
SCRIPTEOF

echo ""
echo "✅ Organization complete!"
echo ""
echo "📊 New structure:"
echo "  docs/"
echo "    ├── guides/          (user guides & setup)"
echo "    ├── analysis/        (technical analysis)"
echo "    ├── api/            (API documentation)"
echo "    └── README.md"
echo ""
echo "  database/"
echo "    ├── migrations/      (timestamped SQL migrations)"
echo "    ├── schemas/         (schema snapshots)"
echo "    ├── scripts/        (database management)"
echo "    └── README.md"
echo ""
echo "  scripts/"
echo "    ├── deployment/      (device setup & deployment)"
echo "    ├── testing/        (load tests)"
echo "    ├── monitoring/     (health checks)"
echo "    └── README.md"
echo ""
echo "  archive/             (old files & backups)"
echo ""
echo "✨ All done!"

