-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ip TEXT NOT NULL,
  status TEXT NOT NULL,
  last_ping TIMESTAMP NOT NULL,
  current_media TEXT,
  system_info JSONB
);

-- Media files
CREATE TABLE IF NOT EXISTS media_files (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  saved_filename TEXT,
  type TEXT,
  duration INTEGER,
  upload_date TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_media (
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
  position INTEGER,
  PRIMARY KEY (playlist_id, media_id)
);

-- Schedules
CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  repeat TEXT
);

-- Device commands
CREATE TABLE IF NOT EXISTS device_commands (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  parameters JSONB,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMP
);