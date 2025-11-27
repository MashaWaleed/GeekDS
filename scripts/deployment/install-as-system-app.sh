#!/bin/bash
# Install GeekDS as System App (requires root)
# This grants automatic system permissions including silent APK installation

set -e

APK_PATH="/home/masha/projects/GeekDS/backend/apk/app-debug.apk"
SYSTEM_PATH="/system/priv-app/GeekDS"

echo "🚀 Installing GeekDS as System App"
echo "===================================="
echo ""

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected via ADB"
    echo "   Please connect device and enable USB debugging"
    exit 1
fi

echo "✅ Device connected"

# Check if APK exists
if [ ! -f "$APK_PATH" ]; then
    echo "❌ APK not found at $APK_PATH"
    echo "   Please build the app first:"
    echo "   cd app && ./gradlew assembleDebug"
    exit 1
fi

echo "✅ APK found: $APK_PATH"
echo ""

# Get root access
echo "🔐 Requesting root access..."
adb root
if [ $? -ne 0 ]; then
    echo "❌ Failed to get root access"
    echo "   Make sure your device supports 'adb root'"
    exit 1
fi

echo "✅ Root access granted"
sleep 2

# Remount system partition as read-write
echo "🔓 Remounting /system as read-write..."
adb remount
if [ $? -ne 0 ]; then
    echo "⚠️  Standard remount failed, trying alternative method..."
    adb shell "mount -o rw,remount /system"
fi

echo "✅ System partition remounted"
echo ""

# Create directory and push APK
echo "📦 Installing APK to $SYSTEM_PATH..."
adb shell "mkdir -p $SYSTEM_PATH"
adb push "$APK_PATH" "$SYSTEM_PATH/GeekDS.apk"

if [ $? -ne 0 ]; then
    echo "❌ Failed to push APK"
    exit 1
fi

echo "✅ APK installed to system partition"

# Set correct permissions
echo "🔒 Setting permissions..."
adb shell "chmod 755 $SYSTEM_PATH"
adb shell "chmod 644 $SYSTEM_PATH/GeekDS.apk"
adb shell "chown root:root $SYSTEM_PATH/GeekDS.apk"

echo "✅ Permissions set"
echo ""

# Create and install privileged permissions whitelist
echo "🔑 Creating privileged app permissions whitelist..."
cat > /tmp/privapp-permissions-geekds.xml << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<permissions>
    <privapp-permissions package="com.example.geekds">
        <permission name="android.permission.INSTALL_PACKAGES"/>
        <permission name="android.permission.DELETE_PACKAGES"/>
    </privapp-permissions>
</permissions>
XMLEOF

# Push permissions file to device
adb push /tmp/privapp-permissions-geekds.xml /system/etc/permissions/privapp-permissions-geekds.xml
adb shell "chmod 644 /system/etc/permissions/privapp-permissions-geekds.xml"
adb shell "chown root:root /system/etc/permissions/privapp-permissions-geekds.xml"

echo "✅ Permissions whitelist installed"
echo ""

# Verify installation
echo "🔍 Verifying installation..."
if adb shell "ls -l $SYSTEM_PATH/GeekDS.apk" | grep -q "GeekDS.apk"; then
    echo "✅ Verified: APK exists in system partition"
    
    # Show file info
    echo ""
    echo "📊 File details:"
    adb shell "ls -lh $SYSTEM_PATH/GeekDS.apk"
else
    echo "❌ Verification failed - APK not found in system partition"
    exit 1
fi

echo ""
echo "🔄 Rebooting device to activate system app..."
echo "   (The app will have full system privileges after reboot)"
echo ""

read -p "Reboot now? [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    adb reboot
    echo ""
    echo "✅ Device rebooting..."
    echo ""
    echo "🎉 SUCCESS!"
    echo ""
    echo "After reboot:"
    echo "  ✅ GeekDS will run with system privileges"
    echo "  ✅ Silent APK installation will work"
    echo "  ✅ No Device Owner needed"
    echo ""
    echo "Next steps:"
    echo "  1. Wait for device to boot up"
    echo "  2. Test silent update: Set update_requested = true in database"
    echo "  3. Watch it install silently!"
    echo ""
else
    echo ""
    echo "⚠️  Reboot cancelled"
    echo "   Please reboot manually to activate the system app"
    echo "   Run: adb reboot"
    echo ""
fi
