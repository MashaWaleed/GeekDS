CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'media' or 'playlists'
    parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media' AND column_name='folder_id') THEN
        ALTER TABLE media ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='playlists' AND column_name='folder_id') THEN
        ALTER TABLE playlists ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;
