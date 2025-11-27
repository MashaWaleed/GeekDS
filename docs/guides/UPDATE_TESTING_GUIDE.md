# App Update System - Testing Guide

## 🎯 Overview

The app update system allows you to remotely update the GeekDS Android app by setting a flag in the database. The device will automatically download and install the new APK from the backend server.

## 📋 Setup Steps

### 1. Build and Deploy APK to Backend

```bash
# Navigate to app directory
cd /home/masha/projects/GeekDS/app

# Build the APK
./gradlew assembleDebug

# Copy to backend APK directory
cp build/outputs/apk/debug/app-debug.apk ../backend/apk/

# Verify the file exists
ls -lh ../backend/apk/app-debug.apk
```

### 2. Restart Backend (if needed)

```bash
cd /home/masha/projects/GeekDS
docker compose restart backend
```

## 🧪 Testing the Update

### Option 1: Direct Database Update (Manual Testing)

```bash
# Connect to database
docker exec -it geekds-db-1 psql -U postgres -d cms

# List all devices
SELECT id, name, app_version, update_requested FROM devices;

# Trigger update for a specific device (replace X with device ID)
UPDATE devices SET update_requested = true WHERE id = X;

# Exit
\q
```

### Option 2: Using API (via curl)

```bash
# Get device list
curl http://localhost:5000/api/devices

# Request update for device ID 1
curl -X PUT http://localhost:5000/api/devices/1 \
  -H "Content-Type: application/json" \
  -d '{"update_requested": true}'
```

## 📱 Expected Behavior on Android Device

1. **Detection** (within ~10 seconds via heartbeat):
   - Device receives `update_requested: true` in heartbeat response
   - Logs: `*** UPDATE REQUESTED BY SERVER ***`

2. **Preparation**:
   - Stops all playback immediately
   - Cancels background tasks
   - Shows "Updating GeekDS..." screen

3. **Download**:
   - Downloads APK from: `http://your-server:5000/api/devices/apk/latest`
   - Logs progress every 1MB
   - Saves to: `/storage/emulated/0/Android/data/com.example.geekds/files/GeekDS-update.apk`

4. **Installation**:
   - Launches Android package installer
   - User sees system install prompt (tap "Install")
   - App closes during installation

5. **Post-Install**:
   - Android automatically restarts the app with new version
   - Device re-registers with updated `app_version` in heartbeat

## 🔍 Monitoring & Debugging

### Watch Android Logs

```bash
# Full logs
adb logcat | grep GeekDS

# Update-specific logs
adb logcat | grep -E "UPDATE REQUESTED|APK|Download|Install"
```

### Check Backend Logs

```bash
docker logs -f geekds-backend-1
```

### Verify APK Download Endpoint

```bash
# Check if APK is accessible
curl -I http://localhost:5000/api/devices/apk/latest

# Should return:
# HTTP/1.1 200 OK
# Content-Type: application/vnd.android.package-archive
# Content-Length: <file-size>
```

## ⚠️ Important Notes

### APK Path (Hardcoded in Android)

The APK download URL is hardcoded in `MainActivity.kt`:
```kotlin
val apkUrl = "$cmsUrl/api/devices/apk/latest"
```

No need to include in heartbeat response - it's always the same path.

### File Permissions

- Android 7.0+ uses FileProvider (configured in AndroidManifest.xml)
- Older versions use direct file URIs
- APK saved to app's external files directory (no MANAGE_EXTERNAL_STORAGE needed)

### User Interaction

- Update is **NOT** fully silent (unless device is in kiosk mode)
- User must tap "Install" in Android's system installer
- For fully automated updates, device needs Device Owner privileges

### Rollback

To reset the update flag after testing:

```sql
UPDATE devices SET update_requested = false WHERE id = X;
```

## 🐛 Troubleshooting

### APK Download Fails (HTTP 404)

- Check if `backend/apk/app-debug.apk` exists
- Verify file permissions: `ls -lh backend/apk/`

### Installer Doesn't Launch

- Check logcat for FileProvider errors
- Verify `file_paths.xml` exists in `app/src/main/res/xml/`
- Ensure `REQUEST_INSTALL_PACKAGES` permission in AndroidManifest.xml

### App Doesn't Stop Playback

- Check if `update_requested` field exists in database
- Verify heartbeat is running (check logs every 10 seconds)
- Ensure backend returns the field in heartbeat response

### Installation Succeeds But Old Version Still Running

- Check `app_version` in heartbeat after update
- Verify new APK has higher `versionName` in `build.gradle`
- Android may keep old version if versionCode didn't increment

## 📊 Version Tracking

After successful update, verify in database:

```sql
SELECT id, name, app_version, update_requested, last_ping 
FROM devices 
ORDER BY last_ping DESC;
```

The `app_version` should reflect the new version from `build.gradle`.

## 🚀 Production Deployment

### Automated Build & Deploy Script

```bash
#!/bin/bash
# deploy-update.sh

cd /home/masha/projects/GeekDS/app
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    cp build/outputs/apk/debug/app-debug.apk ../backend/apk/
    echo "✅ APK deployed to backend/apk/"
    
    # Optionally restart backend
    # cd .. && docker compose restart backend
else
    echo "❌ Build failed"
    exit 1
fi
```

### Trigger Update for All Devices

```sql
-- Update all devices at once
UPDATE devices SET update_requested = true WHERE status = 'online';

-- Update specific devices by name pattern
UPDATE devices SET update_requested = true WHERE name LIKE 'Display-%';
```

---

**Ready to test!** 🎉

Place your APK in `backend/apk/app-debug.apk` and set `update_requested = true` in the database.
