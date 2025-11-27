# APK Directory

This directory stores the latest APK file for app updates.

## Setup

Place the latest `app-debug.apk` file here:

```bash
# Build APK from Android project
cd /path/to/GeekDS/app
./gradlew assembleDebug

# Copy to backend
cp build/outputs/apk/debug/app-debug.apk /path/to/GeekDS/backend/apk/
```

## URL

Devices will download from: `http://your-server:5000/api/devices/apk/latest`

This path is hardcoded in the Android client.
