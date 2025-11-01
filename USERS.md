# User Accounts Reference

## All User Credentials

After running `create_all_users.sql`, these accounts will be created:

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | xnj9b787n | admin |
| user1    | 7z22c5jez | admin |
| user2    | d328fa940 | admin |
| user3    | 00b1ud8wb | admin |
| user4    | eo6504rvy | admin |

## How to Create These Users

```bash
# After docker-compose up and database initialization:
docker exec -i geekds-db-1 psql -U geekds -d geekds < create_all_users.sql
```

## Password Security

⚠️ **IMPORTANT**: These are initial setup passwords. Users should change them after first login.

## Adding More Users

To add more users, you can either:

1. **Use the SQL file method**: Edit `create_all_users.sql` and add more INSERT statements
2. **Use the generator script**:
   ```bash
   cd backend
   node generate_users.js
   ```
   Then copy the SQL output

## Removing Users

```bash
docker exec -it geekds-db-1 psql -U geekds -d geekds
# Then in psql:
DELETE FROM users WHERE username = 'user_to_delete';
```
