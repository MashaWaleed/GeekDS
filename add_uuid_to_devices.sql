-- Enable UUID extension (uuid-ossp) if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add durable UUID identity to devices
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS uuid UUID NOT NULL DEFAULT uuid_generate_v4();

-- Ensure uniqueness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'devices_uuid_key'
  ) THEN
    CREATE UNIQUE INDEX devices_uuid_key ON devices (uuid);
  END IF;
END $$;
