const bcrypt = require('bcrypt');

async function createUser() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';
  
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  
  console.log('\n=== User Credentials ===');
  console.log('Username:', username);
  console.log('Password:', password);
  console.log('\n=== SQL Command ===');
  console.log(`INSERT INTO users (username, password_hash, role) VALUES ('${username}', '${hash}', 'admin') ON CONFLICT (username) DO UPDATE SET password_hash = '${hash}';`);
  console.log('\n');
}

createUser().catch(console.error);
