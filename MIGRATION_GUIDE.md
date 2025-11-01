# GeekDS Migration Guide - Complete Setup on New Server

This guide will walk you through setting up GeekDS on a new server from scratch.

## Prerequisites

Before starting, ensure the new server has:
- Docker installed
- Docker Compose installed
- Git installed (to clone the repository)
- Ports 3000 and 5000 available

## Step-by-Step Migration Process

### Step 1: Clone the Repository

```bash
# SSH into your new server, then:
cd ~
git clone https://github.com/MashaWaleed/GeekDS.git
cd GeekDS
```

### Step 2: Set Up Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cd backend
nano .env
```

Add the following content (replace `your-secret-key` with a random string):

```env
JWT_SECRET=your-super-secret-random-key-change-this-in-production
PORT=5000
DATABASE_URL=postgresql://geekds:geekds123@db:5432/geekds
REDIS_URL=redis://redis:6379
```

**IMPORTANT**: Generate a secure JWT_SECRET:
```bash
# Run this to generate a random secret:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

```bash
# Return to project root
cd ..
```

### Step 3: Build and Start All Containers

```bash
docker-compose up --build -d
```

This will:
- Build the frontend container
- Build the backend container
- Start PostgreSQL database
- Start Redis cache
- Start all services

**Wait 30-60 seconds** for all services to start up.

### Step 4: Verify Containers are Running

```bash
docker ps
```

You should see 5 containers running:
- `geekds-frontend-1`
- `geekds-backend-1`
- `geekds-db-1`
- `geekds-redis-1`
- `geekds-nginx-1` (if you have nginx)

### Step 5: Initialize the Database Schema

```bash
# Copy the init.sql to the database container and execute it
docker exec -i geekds-db-1 psql -U geekds -d geekds < init.sql
```

You should see output like:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
CREATE TABLE
...
```

### Step 6: Create User Accounts

```bash
# Copy the users SQL file to the database container and execute it
docker exec -i geekds-db-1 psql -U geekds -d geekds < create_all_users.sql
```

You should see output like:
```
CREATE TABLE
DELETE 0
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
```

This creates 5 user accounts:
- **admin** / xnj9b787n
- **user1** / 7z22c5jez
- **user2** / d328fa940
- **user3** / 00b1ud8wb
- **user4** / eo6504rvy

### Step 7: Verify the Application is Running

1. **Check backend health**:
```bash
curl http://localhost:5000/api/health
```
Should return: `{"status":"ok"}`

2. **Check frontend**:
Open your browser and go to:
```
http://your-server-ip:3000
```

You should see the login page.

### Step 8: Test Login

1. Go to `http://your-server-ip:3000`
2. Login with:
   - **Username**: admin
   - **Password**: xnj9b787n
3. You should be redirected to the dashboard

### Step 9: (Optional) Copy Existing Media Files

If you have media files from the old server:

```bash
# On OLD server:
cd /path/to/old/GeekDS
tar -czf media_backup.tar.gz media/

# Copy to new server
scp media_backup.tar.gz user@new-server-ip:~/GeekDS/

# On NEW server:
cd ~/GeekDS
tar -xzf media_backup.tar.gz
# Now restart backend to pick up the files
docker restart geekds-backend-1
```

### Step 10: (Optional) Copy Existing Database

If you want to migrate data from the old server:

```bash
# On OLD server - backup the database
docker exec geekds-db-1 pg_dump -U geekds -d geekds > geekds_backup.sql

# Copy to new server
scp geekds_backup.sql user@new-server-ip:~/GeekDS/

# On NEW server - restore the database
docker exec -i geekds-db-1 psql -U geekds -d geekds < geekds_backup.sql

# Then create the users table and users (Step 6 above)
docker exec -i geekds-db-1 psql -U geekds -d geekds < create_all_users.sql
```

## Troubleshooting

### Container not starting?

Check logs:
```bash
# Backend logs
docker logs geekds-backend-1

# Frontend logs
docker logs geekds-frontend-1

# Database logs
docker logs geekds-db-1
```

### Can't connect to database?

```bash
# Check if database is ready
docker exec -it geekds-db-1 psql -U geekds -d geekds -c "SELECT 1;"
```

### Reset everything and start fresh:

```bash
# Stop and remove all containers, volumes, and networks
docker-compose down -v

# Remove all media files (CAREFUL!)
rm -rf media/* backend/media/*

# Start from Step 3
docker-compose up --build -d
```

### Port already in use?

If ports 3000 or 5000 are in use, edit `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "8080:3000"  # Change 3000 to 8080 (or any free port)

backend:
  ports:
    - "8000:5000"  # Change 5000 to 8000 (or any free port)
```

## Quick Reference - User Accounts

After running `create_all_users.sql`, these accounts will be available:

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | xnj9b787n | admin |
| user1    | 7z22c5jez | admin |
| user2    | d328fa940 | admin |
| user3    | 00b1ud8wb | admin |
| user4    | eo6504rvy | admin |

**IMPORTANT**: All users have admin privileges. Consider changing passwords after first login.

## Post-Migration Checklist

- [ ] All containers running (`docker ps`)
- [ ] Database initialized (`init.sql` executed)
- [ ] Users created (`create_all_users.sql` executed)
- [ ] Can access frontend at http://server-ip:3000
- [ ] Can login with admin account
- [ ] Backend health check passes
- [ ] (Optional) Media files copied from old server
- [ ] (Optional) Database backed up and restored

## Security Recommendations

1. **Change JWT_SECRET** in `.env` to a secure random value
2. **Change all user passwords** after first login
3. **Set up HTTPS** using nginx reverse proxy with SSL certificates
4. **Set up firewall** rules to restrict access to ports 3000/5000
5. **Regular backups** of database and media files

## Complete Migration Command Summary

```bash
# 1. Clone repository
git clone https://github.com/MashaWaleed/GeekDS.git && cd GeekDS

# 2. Setup backend .env
cd backend
cat > .env << 'EOF'
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
PORT=5000
DATABASE_URL=postgresql://geekds:geekds123@db:5432/geekds
REDIS_URL=redis://redis:6379
EOF
cd ..

# 3. Build and start
docker-compose up --build -d

# 4. Wait for startup
sleep 30

# 5. Initialize database
docker exec -i geekds-db-1 psql -U geekds -d geekds < init.sql

# 6. Create users
docker exec -i geekds-db-1 psql -U geekds -d geekds < create_all_users.sql

# 7. Verify
curl http://localhost:5000/api/health

# 8. Done! Access at http://your-server-ip:3000
```

Login with: **admin** / **xnj9b787n**
