-- Fix timezone issue: Make updated_at columns store UTC timestamps
-- Problem: updated_at was storing local Cairo time, causing version comparison issues

-- 1. Update the trigger function to use UTC
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = (NOW() AT TIME ZONE 'UTC');
    RETURN NEW;
END;
$$;

-- 2. Convert existing timestamps from Cairo (UTC+2) to UTC
-- Assuming the timestamps are currently in Cairo timezone (UTC+2)
UPDATE schedules SET updated_at = updated_at - INTERVAL '2 hours';
UPDATE playlists SET updated_at = updated_at - INTERVAL '2 hours';
UPDATE folders SET updated_at = updated_at - INTERVAL '2 hours';

-- Note: This migration assumes your server is in Cairo timezone (UTC+2)
-- If your server timezone is different, adjust the interval accordingly
