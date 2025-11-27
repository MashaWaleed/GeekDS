-- Migration: Add app_version and update_requested columns to devices table
-- Purpose: Track the version of the Android application running on each device
--          and flag devices that are requesting updates
-- Date: 2024

-- Add app_version column to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS app_version VARCHAR(50) DEFAULT 'unknown';

-- Add update_requested column to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS update_requested BOOLEAN DEFAULT FALSE;

-- Add comments to document the columns
COMMENT ON COLUMN devices.app_version IS 'Version of the Android app running on this device (auto-detected from build.gradle)';
COMMENT ON COLUMN devices.update_requested IS 'Flag indicating if device has requested an update (sent via heartbeat)';

-- Optional: Update existing devices to have default values
UPDATE devices SET app_version = 'unknown' WHERE app_version IS NULL;
UPDATE devices SET update_requested = FALSE WHERE update_requested IS NULL;
