-- Add versioning columns to playlists and schedules tables
-- This helps Android app detect when playlists/schedules have been modified

-- Add updated_at column to playlists
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add updated_at column to schedules  
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update playlist timestamp when media changes (must be created before trigger)
CREATE OR REPLACE FUNCTION update_playlist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE playlists SET updated_at = NOW() WHERE id = OLD.playlist_id;
        RETURN OLD;
    ELSE
        UPDATE playlists SET updated_at = NOW() WHERE id = NEW.playlist_id;
        RETURN NEW;
    END IF;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at when rows are modified
DROP TRIGGER IF EXISTS update_playlists_updated_at ON playlists;
CREATE TRIGGER update_playlists_updated_at 
    BEFORE UPDATE ON playlists 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at 
    BEFORE UPDATE ON schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Also trigger when playlist_media is updated (affects playlist content)
DROP TRIGGER IF EXISTS update_playlists_on_media_change ON playlist_media;
CREATE TRIGGER update_playlists_on_media_change
    AFTER INSERT OR UPDATE OR DELETE ON playlist_media
    FOR EACH ROW EXECUTE FUNCTION update_playlist_timestamp();
