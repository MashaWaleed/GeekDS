#!/bin/bash
# Script to set GeekDS as Device Owner via ADB
# Run this on a FACTORY RESET device with NO Google accounts

set -e

echo "🔧 GeekDS Device Owner Setup"
echo "=============================="
echo ""

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected via ADB"
    echo "   Please connect device and enable USB debugging"
    exit 1
fi

echo "✅ Device connected"
echo ""

# Check if app is installed
if ! adb shell pm list packages | grep -q "com.example.geekds"; then
    echo "📱 GeekDS app not installed, installing..."
    
    # Find the APK
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    if [ ! -f "$APK_PATH" ]; then
        echo "❌ APK not found at $APK_PATH"
        echo "   Please build the app first: cd app && ./gradlew assembleDebug"
        exit 1
    fi
    
    adb install "$APK_PATH"
    echo "✅ App installed"
else
    echo "✅ App already installed"
fi

echo ""
echo "🔐 Setting as Device Owner..."

# Attempt to set as device owner and capture output
OUTPUT=$(adb shell dpm set-device-owner com.example.geekds/.DeviceAdminReceiver 2>&1)

if echo "$OUTPUT" | grep -q "Success"; then
    echo ""
    echo "🎉 SUCCESS! GeekDS is now Device Owner"
    echo ""
    echo "✅ Silent APK updates are now enabled"
    echo "✅ App has full system control"
    echo ""
    echo "To verify, check logs:"
    echo "  adb logcat | grep 'Device Owner'"
    echo ""
else
    echo ""
    echo "❌ FAILED to set Device Owner"
    echo ""
    echo "Error output:"
    echo "$OUTPUT"
    echo ""
    echo "Common reasons:"
    echo "  1. Device has Google account(s) - MUST factory reset and skip Google login"
    echo "  2. Device already has a Device Owner"
    echo "  3. Device has work profile or other admin apps"
    echo "  4. Device is already set up (not in provisioning mode)"
    echo ""
    echo "Solutions:"
    echo "  1. Factory reset: Settings → System → Reset → Factory data reset"
    echo "  2. During setup, skip ALL Google accounts"
    echo "  3. Complete the initial setup wizard first"
    echo "  4. Enable USB debugging: Settings → Developer options"
    echo "  5. Run this script again"
    echo ""
    
    exit 1
fi
