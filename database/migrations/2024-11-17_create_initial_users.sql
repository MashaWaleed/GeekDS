-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delete existing users (clean slate)
DELETE FROM users;

-- Insert admin with password: xnj9b787n
INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$dBvYOG0O7uGobILTEeYVIOZvk3iqadXP.k4zNaqIUnTIKK2VIu86i', 'admin');

-- Insert user1 with password: 7z22c5jez
INSERT INTO users (username, password_hash, role)
VALUES ('user1', '$2b$10$gwHb8x046iTkDN/oC4Kvb.Vh4gQ96Gh7avsafeUGLh9plmvkWSfj6', 'admin');

-- Insert user2 with password: d328fa940
INSERT INTO users (username, password_hash, role)
VALUES ('user2', '$2b$10$tkFjAjxm8OVA00zW0uBR8.xuhzywdlaemMjgiHLtAJditpWGVMqju', 'admin');

-- Insert user3 with password: 00b1ud8wb
INSERT INTO users (username, password_hash, role)
VALUES ('user3', '$2b$10$7yRhjbfGCNFKWKFBFl4LMe2jfAdOLTEybiyr79TDWOKoYa/UEFTFK', 'admin');

-- Insert user4 with password: eo6504rvy
INSERT INTO users (username, password_hash, role)
VALUES ('user4', '$2b$10$LKIbdkzvw737aEWaKLfNfO72FJSrCufpQS2f5B4quM0WD1XjKUDg.', 'admin');
