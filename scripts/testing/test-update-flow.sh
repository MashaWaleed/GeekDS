#!/bin/bash
# Test Update Flow - Runs ON the Android device via ADB
# Simulates what the app does to check and install updates

set -e

SERVER_URL="http://192.168.1.11:5000"

echo "🧪 Testing Update Flow on Android Device"
echo "=========================================="
echo ""

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "❌ No Android device connected via ADB"
    exit 1
fi

echo "✅ Device connected"
echo ""

# Step 0: Get device info from SharedPreferences
echo "📱 Step 0: Reading device info from app..."

# Try to get device ID from SharedPreferences
DEVICE_ID=$(adb shell "run-as com.example.geekds cat /data/data/com.example.geekds/shared_prefs/GeekDSPrefs.xml 2>/dev/null | grep 'device_id' | sed 's/.*value=\"\\([0-9]*\\)\".*/\\1/'" 2>/dev/null || echo "")

# Try to get UUID as fallback
DEVICE_UUID=$(adb shell "run-as com.example.geekds cat /data/data/com.example.geekds/shared_prefs/GeekDSPrefs.xml 2>/dev/null | grep 'device_uuid' | sed 's/.*value=\"\\([^\"]*\\)\".*/\\1/'" 2>/dev/null || echo "")

if [ -z "$DEVICE_ID" ]; then
    echo "❌ Could not read device ID from app"
    echo "   Make sure the app has been registered at least once"
    exit 1
fi

echo "✅ Device ID: $DEVICE_ID"
[ ! -z "$DEVICE_UUID" ] && echo "   UUID: $DEVICE_UUID"
echo ""

# Step 1: Check if update is requested (via heartbeat)
echo "📡 Step 1: Checking if update is requested..."
HEARTBEAT_RESPONSE=$(adb shell "curl -s -X PATCH '$SERVER_URL/api/devices/$DEVICE_ID/heartbeat' \
  -H 'Content-Type: application/json' \
  -d '{
    \"playback_state\": \"playing\",
    \"uuid\": \"$DEVICE_UUID\",
    \"app_version\": \"1.1\"
  }'")

echo "Response: $HEARTBEAT_RESPONSE"
echo ""

UPDATE_REQUESTED=$(echo "$HEARTBEAT_RESPONSE" | grep -o '"update_requested":[^,}]*' | cut -d':' -f2 | tr -d ' ')

if [ "$UPDATE_REQUESTED" = "true" ]; then
    echo "✅ Update IS requested by server!"
    echo ""
    
    # Step 2: Download APK
    echo "📥 Step 2: Downloading APK to device..."
    APK_PATH="/sdcard/Download/GeekDS-update.apk"
    
    adb shell "curl -s -o '$APK_PATH' '$SERVER_URL/api/devices/apk/latest'"
    
    if adb shell "[ -f '$APK_PATH' ] && echo exists" | grep -q exists; then
        APK_SIZE=$(adb shell "ls -lh '$APK_PATH' | awk '{print \$4}'")
        echo "✅ APK downloaded successfully: $APK_SIZE"
        echo "   Saved to: $APK_PATH"
        echo ""
        
        # Step 3: Install APK
        echo "📦 Step 3: Installing APK..."
        adb shell "pm install -r '$APK_PATH'" && echo "✅ Installation successful" || echo "❌ Installation failed"
        echo ""
        
        # Step 4: Clear update flag
        echo "🧹 Step 4: Clearing update_requested flag..."
        CLEAR_RESPONSE=$(adb shell "curl -s -X POST '$SERVER_URL/api/devices/$DEVICE_ID/clear-update-flag' \
          -H 'Content-Type: application/json' \
          -d '{}'")
        
        echo "Response: $CLEAR_RESPONSE"
        
        SUCCESS=$(echo "$CLEAR_RESPONSE" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ')
        
        if [ "$SUCCESS" = "true" ]; then
            echo "✅ Update flag cleared successfully!"
            echo ""
            echo "🎉 UPDATE FLOW COMPLETE!"
            echo ""
            echo "Summary:"
            echo "  ✅ Detected update request"
            echo "  ✅ Downloaded APK ($APK_SIZE)"
            echo "  ✅ Installed APK"
            echo "  ✅ Cleared update flag"
            echo ""
            echo "Restarting app..."
            adb shell "am force-stop com.example.geekds"
            sleep 1
            adb shell "am start -n com.example.geekds/.MainActivity"
        else
            echo "❌ Failed to clear update flag"
            exit 1
        fi
    else
        echo "❌ Failed to download APK"
        exit 1
    fi
else
    echo "ℹ️  No update requested"
    echo ""
    echo "To trigger an update, run:"
    echo "  docker exec -it geekds-db-1 psql -U postgres -d cms -c \"UPDATE devices SET update_requested = true WHERE id = $DEVICE_ID;\""
fi

echo ""
