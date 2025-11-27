#!/bin/bash
# Quick update for GeekDS system app (no reboot required)
# Use this after the initial install-as-system-app.sh installation

set -e

APK_PATH="/home/masha/projects/GeekDS/backend/apk/app-debug.apk"
SYSTEM_PATH="/system/priv-app/GeekDS"
PACKAGE_NAME="com.example.geekds"

echo "🔄 Quick Update GeekDS System App"
echo "=================================="
echo ""

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected via ADB"
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
echo "🔐 Getting root access..."
adb root
sleep 1

# Remount system partition
echo "🔓 Remounting /system as read-write..."
adb remount 2>/dev/null || adb shell "mount -o rw,remount /system"

echo "✅ System partition remounted"
echo ""

# Push new APK
echo "📦 Updating APK..."
adb push "$APK_PATH" "$SYSTEM_PATH/GeekDS.apk"

if [ $? -ne 0 ]; then
    echo "❌ Failed to push APK"
    exit 1
fi

# Set permissions
adb shell "chmod 644 $SYSTEM_PATH/GeekDS.apk"
adb shell "chown root:root $SYSTEM_PATH/GeekDS.apk"

echo "✅ APK updated"
echo ""

# Kill the app to force restart with new version
echo "🔄 Restarting app..."
adb shell "am force-stop $PACKAGE_NAME" 2>/dev/null || true
adb shell "killall $PACKAGE_NAME" 2>/dev/null || true

# Wait a moment
sleep 2

# Launch the app
echo "🚀 Launching app..."
adb shell "am start -n $PACKAGE_NAME/.MainActivity"

echo ""
echo "✅ Update complete!"
echo ""
echo "The app is now running with the new version."
echo "Check logs with: adb logcat | grep GeekDS"
echo ""
