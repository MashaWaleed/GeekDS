const bcrypt = require('bcrypt');

const users = [
  { username: 'admin', password: 'xnj9b787n' },
  { username: 'user1', password: '7z22c5jez' },
  { username: 'user2', password: 'd328fa940' },
  { username: 'user3', password: '00b1ud8wb' },
  { username: 'user4', password: 'eo6504rvy' }
];

async function generateHashes() {
  console.log('-- Create users table if it doesn\'t exist');
  console.log(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);
  
  console.log('-- Delete existing users (clean slate)');
  console.log('DELETE FROM users;\n');
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    console.log(`-- Insert ${user.username} with password: ${user.password}`);
    console.log(`INSERT INTO users (username, password_hash, role)`);
    console.log(`VALUES ('${user.username}', '${hash}', 'admin');`);
    console.log('');
  }
}

generateHashes().catch(console.error);
