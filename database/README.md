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
