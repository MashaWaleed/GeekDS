-- Add folder support for organizing media and playlists
-- This script adds the necessary tables and columns without affecting existing APIs

-- Create folders table for organizing content
CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('media', 'playlist')),
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add folder_id to media_files table (nullable for backward compatibility)
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

-- Add folder_id to playlists table (nullable for backward compatibility)
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_folders_type ON folders(type);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_media_files_folder ON media_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_playlists_folder ON playlists(folder_id);

-- Add trigger to update folders timestamp
CREATE OR REPLACE FUNCTION update_folder_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS update_folders_updated_at ON folders;
CREATE TRIGGER update_folders_updated_at 
    BEFORE UPDATE ON folders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_folder_timestamp();

-- Create some default folders
INSERT INTO folders (name, type) VALUES 
    ('Default Media', 'media'),
    ('Default Playlists', 'playlist')
ON CONFLICT DO NOTHING;
