#!/bin/bash
# Script to take screenshot from rooted Android TV device
# Usage: ./screenshot_device.sh [device_ip] [output_filename]

DEVICE_IP="${1:-192.168.1.12}"
OUTPUT_FILE="${2:-screenshot_$(date +%Y%m%d_%H%M%S).png}"

echo "📸 Taking screenshot from device at ${DEVICE_IP}:3222..."

# Connect to device
echo "🔌 Connecting..."
adb connect ${DEVICE_IP}:3222

# Get root access
echo "🔓 Getting root access..."
adb root

# Wait a moment for root to be established
sleep 2

# Reconnect after root
echo "🔄 Reconnecting with root..."
adb connect ${DEVICE_IP}:3222

# Take screenshot (this works even with DRM content!)
echo "📷 Capturing screen..."
adb shell screencap -p /sdcard/screenshot_temp.png

# Pull screenshot to local machine
echo "⬇️  Downloading screenshot..."
adb pull /sdcard/screenshot_temp.png "${OUTPUT_FILE}"

# Clean up temp file on device
echo "🧹 Cleaning up..."
adb shell rm /sdcard/screenshot_temp.png

# Disconnect
adb disconnect

echo "✅ Screenshot saved to: ${OUTPUT_FILE}"
echo ""
echo "💡 Tip: You can also use: screencap -p | base64 | adb shell base64 -d > screenshot.png"
