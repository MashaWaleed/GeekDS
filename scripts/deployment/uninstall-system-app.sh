#!/bin/bash
# Uninstall GeekDS System App
# This completely removes the app from /system/priv-app/

set -e

SYSTEM_PATH="/system/priv-app/GeekDS"
PERMISSIONS_FILE="/system/etc/permissions/privapp-permissions-geekds.xml"
PACKAGE_NAME="com.example.geekds"

echo "🗑️  Uninstalling GeekDS System App"
echo "===================================="
echo ""

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected via ADB"
    exit 1
fi

echo "✅ Device connected"
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

# Stop the app first
echo "⏹️  Stopping app..."
adb shell "am force-stop $PACKAGE_NAME" 2>/dev/null || true
adb shell "killall $PACKAGE_NAME" 2>/dev/null || true

echo "✅ App stopped"
echo ""

# Remove the app directory
echo "🗑️  Removing app from system partition..."
if adb shell "ls $SYSTEM_PATH" &> /dev/null; then
    adb shell "rm -rf $SYSTEM_PATH"
    echo "✅ App directory removed: $SYSTEM_PATH"
else
    echo "⚠️  App directory not found: $SYSTEM_PATH"
fi

# Remove permissions whitelist
echo "🗑️  Removing permissions whitelist..."
if adb shell "ls $PERMISSIONS_FILE" &> /dev/null; then
    adb shell "rm -f $PERMISSIONS_FILE"
    echo "✅ Permissions whitelist removed"
else
    echo "⚠️  Permissions whitelist not found"
fi

# Clear app data (if still installed as user app)
echo "🧹 Clearing app data..."
adb shell "pm clear $PACKAGE_NAME" 2>/dev/null || echo "   (App already uninstalled)"

echo ""
echo "🔄 Rebooting device..."
echo ""

read -p "Reboot now to complete uninstallation? [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    adb reboot
    echo ""
    echo "✅ Device rebooting..."
    echo ""
    echo "🎉 UNINSTALL COMPLETE!"
    echo ""
    echo "After reboot, GeekDS will be completely removed from the system."
    echo ""
else
    echo ""
    echo "⚠️  Reboot cancelled"
    echo "   Please reboot manually to complete uninstallation"
    echo "   Run: adb reboot"
    echo ""
fi
