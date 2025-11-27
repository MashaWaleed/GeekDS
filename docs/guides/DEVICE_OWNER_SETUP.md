# Device Owner Setup Guide for Silent App Updates

## 🎯 Problem

With 300+ Android TV boxes, manual APK installation is not feasible. The system needs **SILENT UPDATES** with zero user interaction.

## ✅ Solution: Device Owner Mode

Android's Device Owner (kiosk) mode allows apps to:
- ✅ Install APKs silently (no user prompts)
- ✅ Update themselves automatically
- ✅ Prevent users from exiting the app
- ✅ Full system control

---

## 📋 Setup Methods

### **Method 1: ADB Command (Easiest for Factory Setup)**

Use this when setting up devices fresh out of the box:

```bash
# 1. Factory reset the device (or use fresh device)
# Settings → System → Reset → Factory data reset

# 2. Skip Google account setup during initial wizard
# (Device MUST NOT have any Google accounts)

# 3. Install your APK
adb install app-debug.apk

# 4. Set as Device Owner
adb shell dpm set-device-owner com.example.geekds/.DeviceAdminReceiver
```

**Expected output:**
```
Success: Device owner set to package com.example.geekds
Active admin set to component {com.example.geekds/com.example.geekds.DeviceAdminReceiver}
```

---

### **Method 2: NFC Provisioning (For Bulk Deployment)**

Use NFC tags to provision multiple devices quickly:

1. **Create provisioning NFC tag** with this data:
```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.example.geekds/.DeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "http://192.168.1.11:5000/api/devices/apk/latest",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
  "android.app.extra.PROVISIONING_WIFI_SSID": "YourWiFiSSID",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "YourPassword"
}
```

2. **Tap NFC tag** on factory-reset device during setup
3. Device automatically downloads and provisions the app as Device Owner

---

### **Method 3: QR Code Provisioning (Android 7+)**

1. Factory reset device
2. During setup, tap screen 6 times on welcome screen
3. Scan QR code with provisioning data:

```bash
# Generate QR code from this JSON:
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.example.geekds/.DeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "http://192.168.1.11:5000/api/devices/apk/latest",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
  "android.app.extra.PROVISIONING_WIFI_SSID": "YourWiFiSSID",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "YourPassword",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true
}
```

Use online QR generator: https://www.qr-code-generator.com/

---

## 🔧 Required Code Changes

### **1. Create DeviceAdminReceiver**

Create file: `app/src/main/java/com/example/geekds/DeviceAdminReceiver.kt`

```kotlin
package com.example.geekds

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class DeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i("GeekDS", "Device Owner enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i("GeekDS", "Device Owner disabled")
    }
}
```

### **2. Create Device Admin Policy XML**

Create file: `app/src/main/res/xml/device_admin.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <limit-password />
        <watch-login />
        <reset-password />
        <force-lock />
        <wipe-data />
        <expire-password />
        <encrypted-storage />
        <disable-camera />
    </uses-policies>
</device-admin>
```

### **3. Update AndroidManifest.xml**

Add the DeviceAdminReceiver to your manifest:

```xml
<receiver
    android:name=".DeviceAdminReceiver"
    android:exported="true"
    android:permission="android.permission.BIND_DEVICE_ADMIN">
    <meta-data
        android:name="android.app.device_admin"
        android:resource="@xml/device_admin" />
    <intent-filter>
        <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
    </intent-filter>
</receiver>
```

---

## 🧪 Testing Silent Installation

### **1. Verify Device Owner Status**

```bash
adb shell dpm list-owners
# Should show: com.example.geekds
```

### **2. Check if Silent Install Works**

```bash
# Update the flag in database
docker exec -it geekds-db-1 psql -U postgres -d cms
UPDATE devices SET update_requested = true WHERE id = 243;
\q

# Watch logs
adb logcat | grep -E "Silent install|GeekDS.*install"
```

**Expected logs:**
```
I GeekDS  : Attempting silent installation...
I GeekDS  : Silent installation session created successfully (ID: 123456)
I GeekDS  : Silent install initiated, device will restart shortly
```

**No prompts, no user interaction!** ✅

---

## 🚀 Production Deployment Workflow

### **For 300+ Devices:**

1. **Initial Setup (One-time per device)**:
   ```bash
   # Use NFC/QR provisioning for bulk setup
   # - Factory reset all devices
   # - Tap NFC tag or scan QR code
   # - Devices auto-provision as Device Owner
   ```

2. **Deploy Updates**:
   ```bash
   # 1. Build new APK
   cd app && ./gradlew assembleDebug
   
   # 2. Deploy to backend
   cp build/outputs/apk/debug/app-debug.apk ../backend/apk/
   
   # 3. Trigger update for all devices
   docker exec -it geekds-db-1 psql -U postgres -d cms
   UPDATE devices SET update_requested = true WHERE status = 'online';
   \q
   ```

3. **Monitor Progress**:
   ```bash
   # Check how many devices have updated
   docker exec -it geekds-db-1 psql -U postgres -d cms -c \
     "SELECT app_version, COUNT(*) FROM devices GROUP BY app_version;"
   ```

---

## ⚠️ Important Notes

### **Device Owner Limitations**

- ✅ **MUST** be set on factory-reset device (no Google accounts)
- ✅ Can be set via ADB, NFC, or QR code
- ❌ Cannot be set on already-configured devices (requires factory reset)
- ❌ Only ONE Device Owner per device

### **Removing Device Owner** (if needed)

```bash
# Method 1: ADB
adb shell dpm remove-active-admin com.example.geekds/.DeviceAdminReceiver

# Method 2: Factory reset device
```

### **Without Device Owner**

If you can't set Device Owner, silent install will fail gracefully and fall back to:
- Regular APK installer (requires user to tap "Install")
- Still works, just not silent

---

## 📊 Silent Install Success Indicators

✅ **Working (Device Owner mode)**:
```
I GeekDS  : Attempting silent installation...
I GeekDS  : Silent installation session created successfully
I GeekDS  : Silent install initiated, device will restart shortly
# App automatically restarts with new version
```

❌ **Not Working (No Device Owner)**:
```
W GeekDS  : Silent install failed - app is not Device Owner
W GeekDS  : Silent install not available, falling back to regular install
I GeekDS  : Launching APK installer (FileProvider)
# User sees install prompt
```

---

## 🔄 Auto-Reset Update Flag

After successful update, the backend should auto-reset the flag:

```sql
-- Backend should automatically detect new version in heartbeat and reset flag
UPDATE devices 
SET update_requested = false 
WHERE update_requested = true 
  AND app_version = '1.2'; -- New version
```

Or add to backend heartbeat handler:
```typescript
// In heartbeat response, check if update completed
if (deviceState.update_requested && req.body.app_version === targetVersion) {
  await pool.query(
    'UPDATE devices SET update_requested = false WHERE id = $1',
    [id]
  );
  console.log(`Device ${id} updated successfully to ${targetVersion}`);
}
```

---

## 🎯 Summary

**For 300+ TV boxes with ZERO user interaction:**

1. ✅ Set all devices as Device Owner during initial setup
2. ✅ Use NFC/QR provisioning for bulk deployment
3. ✅ Silent installation will work automatically
4. ✅ No prompts, no buttons, fully automated

**Ready to deploy!** 🚀
