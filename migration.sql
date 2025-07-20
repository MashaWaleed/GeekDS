-- Migration to add saved_filename column to media_files table
-- Run this if you have an existing database without the saved_filename column

-- Add saved_filename column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media_files' AND column_name = 'saved_filename'
    ) THEN
        ALTER TABLE media_files ADD COLUMN saved_filename TEXT;
    END IF;
END $$;

-- Update existing records to set saved_filename = filename for backward compatibility
UPDATE media_files SET saved_filename = filename WHERE saved_filename IS NULL; 