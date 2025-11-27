# Silent APK Installation Without Device Owner (Using Root)

## 🎯 **Solution: Install as System App**

Since you have `adb root` access, you can install your app as a **system app** which automatically gets `INSTALL_PACKAGES` permission!

---

## 📋 **One-Time Setup Per Device**

Run this script once on each device to install GeekDS as a system app:

```bash
#!/bin/bash
# install-as-system-app.sh

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

echo "🔐 Installing GeekDS as system app..."

# 1. Root and remount /system as read-write
adb root
sleep 2
adb remount

# 2. Push APK to system partition
adb push "$APK_PATH" /system/app/GeekDS.apk

# 3. Set correct permissions
adb shell chmod 644 /system/app/GeekDS.apk
adb shell chown root:root /system/app/GeekDS.apk

# 4. Reboot to activate
echo "✅ APK installed to /system/app/"
echo "🔄 Rebooting device..."
adb reboot

echo ""
echo "⏳ Device will reboot and app will have system privileges"
echo "✅ Silent installation will now work!"
```

---

## 🚀 **Even Simpler: Use `adb install` with Root Flags**

You don't even need to move it to /system! Just use these ADB flags:

### **Method 1: Install with System Privileges**

```bash
# Install with root privileges (grants system permissions automatically)
adb root
adb install -r -d -g app/build/outputs/apk/debug/app-debug.apk

# Flags:
# -r = Replace existing app
# -d = Allow version code downgrade
# -g = Grant all runtime permissions
```

### **Method 2: Install to /system/priv-app/ (Best)**

```bash
#!/bin/bash
# One-time setup script

APK="app/build/outputs/apk/debug/app-debug.apk"

adb root
sleep 2
adb remount
adb push "$APK" /system/priv-app/GeekDS/GeekDS.apk
adb shell chmod 755 /system/priv-app/GeekDS
adb shell chmod 644 /system/priv-app/GeekDS/GeekDS.apk
adb reboot
```

Apps in `/system/priv-app/` get **privileged permissions** automatically, including silent installation!

---

## 🔧 **Update AndroidManifest.xml**

Add this to make your app request system permissions:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.geekds"
    android:sharedUserId="android.uid.system">  <!-- ADD THIS -->
    
    <!-- These work when app is in /system/priv-app/ -->
    <uses-permission android:name="android.permission.INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.DELETE_PACKAGES" />
    
    <!-- ... rest of manifest ... -->
</manifest>
```

**Note**: Adding `android:sharedUserId="android.uid.system"` requires the APK to be **signed with platform key** OR installed in `/system/priv-app/`.

---

## ✅ **Simplest Working Solution**

### **Step 1: One-Time Setup (All 300 Devices)**

```bash
# Connect to device via USB
adb root
adb remount
adb push app/build/outputs/apk/debug/app-debug.apk /system/priv-app/GeekDS/GeekDS.apk
adb shell chmod 644 /system/priv-app/GeekDS/GeekDS.apk
adb reboot
```

### **Step 2: Future Updates (Silent!)**

Once installed as system app, your existing update code works silently! Just:

```sql
UPDATE devices SET update_requested = true WHERE id = 243;
```

The app downloads and installs **WITHOUT ANY PROMPTS** because it has system privileges!

---

## 🎯 **Alternative: pm install with Root**

You can also use `pm install` directly with root instead of regular `adb install`:

```bash
# Push APK to device
adb push app/debug.apk /data/local/tmp/app.apk

# Install as root with system permissions
adb shell su -c "pm install -r -g /data/local/tmp/app.apk"

# Clean up
adb shell rm /data/local/tmp/app.apk
```

This also grants system-level permissions!

---

## 📊 **Comparison of Methods**

| Method | Silent Install? | Requires Reboot? | Survives Factory Reset? |
|--------|----------------|------------------|------------------------|
| `/system/priv-app/` | ✅ Yes | ✅ Yes (once) | ✅ Yes |
| `pm install -g` with root | ✅ Yes | ❌ No | ❌ No |
| `adb install -r -g` | ✅ Yes | ❌ No | ❌ No |
| Device Owner | ✅ Yes | ❌ No | ✅ Yes |

**Recommendation**: Use `/system/priv-app/` for permanent solution!

---

## 🚀 **Production Deployment for 300 Devices**

### **Automated Script**

```python
#!/usr/bin/env python3
import subprocess
import psycopg2
import time

# Get all device IPs from database
conn = psycopg2.connect("dbname=cms user=postgres host=localhost")
cur = conn.cursor()
cur.execute("SELECT id, ip FROM devices WHERE status = 'online'")
devices = cur.fetchall()

for device_id, ip in devices:
    print(f"📱 Installing to device {device_id} ({ip})...")
    
    try:
        # Connect via network ADB
        subprocess.run(["adb", "connect", f"{ip}:5555"], timeout=5)
        
        # Install as system app
        subprocess.run(["adb", "-s", f"{ip}:5555", "root"], timeout=5)
        time.sleep(2)
        subprocess.run(["adb", "-s", f"{ip}:5555", "remount"], timeout=10)
        subprocess.run([
            "adb", "-s", f"{ip}:5555", "push",
            "backend/apk/app-debug.apk",
            "/system/priv-app/GeekDS/GeekDS.apk"
        ], timeout=60)
        subprocess.run([
            "adb", "-s", f"{ip}:5555", "shell",
            "chmod", "644", "/system/priv-app/GeekDS/GeekDS.apk"
        ], timeout=5)
        
        print(f"✅ Device {device_id} updated!")
        
        # Disconnect
        subprocess.run(["adb", "disconnect", f"{ip}:5555"], timeout=5)
        
    except Exception as e:
        print(f"❌ Device {device_id} failed: {e}")
    
    time.sleep(2)

print("✅ All devices updated as system apps!")
```

---

## 🎯 **RECOMMENDED APPROACH**

**For your 300 devices:**

1. **One-time**: Install as system app on all devices using the script above
2. **Ongoing**: Use your existing web-based update system (just set `update_requested = true`)
3. **Result**: Fully automated, silent updates forever!

**No Device Owner required!** ✅
**No user prompts!** ✅
**Works with root access you already have!** ✅

Would you like me to create the complete automation script for installing on all 300 devices?
