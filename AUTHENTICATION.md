# Authentication & API Security Summary

## 1. Rate Limiting (Updated)
- **General API**: 1000 requests per 15 minutes per IP (very lenient)
- **Login endpoint**: 20 attempts per 15 minutes per IP (to prevent brute force)

## 2. Token Information
- **Token Type**: JWT (JSON Web Token)
- **Expiration**: 24 hours from issuance
- **Storage**: LocalStorage in browser (`authToken` key)
- **Auto-Redirect**: Yes - when token expires or is invalid, user is redirected to `/login`

### Token Refresh
- Token does NOT auto-refresh currently
- User must login again after 24 hours
- Future enhancement: Add token refresh endpoint

## 3. Android Client Endpoints (NO Authentication Required)

These endpoints are intentionally PUBLIC for device functionality:

### Device Registration & Heartbeat
- `POST /api/devices/register-request` - Generate registration code
- `POST /api/devices/register-device` - Complete registration with code
- `GET /api/devices/check-registration/:ip` - Check if device registered (legacy)
- `GET /api/devices/check-registration/by-uuid/:uuid` - Check by UUID (preferred)
- `POST /api/devices/claim` - Auto-claim device by UUID
- `PATCH /api/devices/:id/heartbeat` - Device heartbeat (most used!)
- `PATCH /api/devices/:id` - Legacy heartbeat

### Device Schedule & Playlist Data
- `GET /api/devices/:id/schedule` - Get current active schedule
- `GET /api/devices/:id/schedules/all` - Get all device schedules
- `GET /api/playlists/:id` - Get playlist details (needed by devices)

### Device Commands & Screenshots
- `GET /api/devices/:id/commands/poll` - Poll for commands
- `POST /api/devices/:id/screenshot/upload` - Upload screenshot from device

### Media Files
- `GET /media/*` - Static media file serving (no auth)

## 4. Dashboard User Endpoints (Authentication REQUIRED)

These require JWT token in Authorization header:

### Device Management (Dashboard)
- `GET /api/devices` - List all devices ✅ **NOW PROTECTED**
- `GET /api/devices/:id` - Get single device ✅ **NOW PROTECTED**
- `PUT /api/devices/:id` - Update device info ✅ **NOW PROTECTED**
- `DELETE /api/devices/:id` - Delete device ✅ **NOW PROTECTED**
- `POST /api/devices/:id/screenshot` - Request screenshot ✅ **NOW PROTECTED**
- `GET /api/devices/:id/screenshot/latest` - Get screenshot ✅ **NOW PROTECTED**
- `GET /api/devices/:id/screenshot/status` - Check screenshot status ✅ **NOW PROTECTED**

### Media Management
- `GET /api/media` - List media files
- `POST /api/media` - Upload media file
- `DELETE /api/media/:id` - Delete media file

### Playlist Management
- `GET /api/playlists` - List playlists
- `POST /api/playlists` - Create playlist
- `GET /api/playlists/:id` - Get playlist (also used by devices)
- `PATCH /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist

### Schedule Management
- `GET /api/schedules` - List schedules
- `POST /api/schedules` - Create schedule
- `PATCH /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule

### Folder Management
- `GET /api/folders` - List folders
- `POST /api/folders` - Create folder
- `PATCH /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder

### Commands
- `GET /api/commands` - List commands (requires auth from dashboard)

## 5. Security Considerations

### Why Device Endpoints Are Public:
1. **Devices use UUID**, not user credentials
2. **Heartbeat endpoint** validates device by ID from database
3. Devices are **pre-registered** through admin dashboard
4. Device can only access **its own** schedules/playlists

### Potential Improvements:
1. **Device API Keys**: Generate unique API key per device
2. **Device Token System**: Similar to user tokens but device-specific
3. **IP Whitelisting**: Restrict device endpoints to known IPs
4. **Device Certificate Auth**: Use SSL client certificates

### Current Risk Level:
- **Low for device endpoints**: Devices are already registered, can only access their own data
- **High if no dashboard auth**: Fixed! All management endpoints now require JWT
- **Medium for public `/api/devices` list**: Could hide this behind auth if needed

## 6. Testing Authentication

### Test Login:
```bash
curl -X POST http://your-pi-ip:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Test Protected Endpoint (should fail without token):
```bash
curl http://your-pi-ip:5000/api/media
# Returns: {"error":"Access token required"}
```

### Test Protected Endpoint (with token):
```bash
TOKEN="your-jwt-token-here"
curl http://your-pi-ip:5000/api/media \
  -H "Authorization: Bearer $TOKEN"
```

### Test Device Heartbeat (no auth needed):
```bash
curl -X PATCH http://your-pi-ip:5000/api/devices/1/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"playback_state":"playing","versions":{"schedule":0,"playlist":0}}'
```

## 7. Default Credentials

**Username**: `admin`
**Password**: `admin123`

**IMPORTANT**: Change these in production!

To create a new user:
```bash
cd backend
node create_user.js username password
# Then copy the SQL command and run it in the database
```
