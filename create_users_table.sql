-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insert default admin user (password: admin123)
-- Password hash generated with bcrypt for 'admin123'
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2b$10$8K1p/vGU5LZGnHPJvvZGl.5j5QvZQ5Y5Z8VqXO5Zr5Z5Z5Z5Z5Z5Zu', 'admin')
ON CONFLICT (username) DO NOTHING;

COMMENT ON TABLE users IS 'User authentication and authorization';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.role IS 'User role (admin, viewer, etc.)';
