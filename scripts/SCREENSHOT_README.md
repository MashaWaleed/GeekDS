# Screenshot Commands for Rooted Android TV

## Quick Commands

### Single Line Screenshot (Manual)
```bash
# Connect and get root
adb connect 192.168.1.12:3222 && adb root && sleep 2 && adb connect 192.168.1.12:3222

# Take screenshot and download it
adb shell screencap -p /sdcard/screenshot.png && adb pull /sdcard/screenshot.png && adb shell rm /sdcard/screenshot.png
```

### Using the Script
```bash
chmod +x scripts/screenshot_device.sh
./scripts/screenshot_device.sh 192.168.1.12 my_screenshot.png
```

## Alternative Methods

### Method 1: Direct Stream (Fast, no temp file)
```bash
# This pipes the screenshot directly without saving on device
adb shell "screencap -p" > screenshot.png
```

### Method 2: Base64 Encoding (Most Reliable)
```bash
# Some ADB versions have line ending issues, base64 fixes this
adb shell "screencap -p | base64" | base64 -d > screenshot.png
```

### Method 3: Using Specific Display (Multi-Display Devices)
```bash
# If device has multiple displays, specify which one
adb shell "screencap -p -d 0" > screenshot.png
```

## Why Root Access Works with DRM Content

- **Normal Android Screenshot Protection**: Apps can set `FLAG_SECURE` to prevent screenshots
- **Root Access Bypass**: The `screencap` command with root privileges captures at the framebuffer level, **before** DRM/secure flag checks
- **How it works**: 
  1. `adb root` elevates ADB to root user
  2. `screencap -p` runs as root, accessing `/dev/graphics/fb0` (framebuffer) directly
  3. DRM content protection happens at the app layer, not the framebuffer layer
  4. Root access bypasses all app-level security flags

## Troubleshooting

### "adb: device unauthorized"
```bash
# Re-authorize device
adb kill-server
adb connect 192.168.1.12:3222
# Accept the prompt on TV screen
```

### "screencap: not found"
```bash
# Try alternative path
adb shell /system/bin/screencap -p /sdcard/screenshot.png
```

### Black Screen in Screenshot
```bash
# Some TVs need a moment to render, add delay
adb shell "sleep 0.5 && screencap -p" > screenshot.png
```

### Screenshot Shows Different Frame
```bash
# For video playback, capture at current frame
adb shell screencap -p /sdcard/screenshot.png
# Check timestamp: ls -l /sdcard/screenshot.png
```

## Integration with GeekDS Backend

You can modify the backend screenshot endpoint to use this command:

```typescript
// In devices.ts, line 580+
const { spawn } = require('child_process');

// Instead of ffmpeg, use ADB
const adb = spawn('adb', [
  'connect', `${device.ip}:3222`
]);

// Then after connection:
const screencap = spawn('adb', [
  'shell', 'screencap', '-p', '/sdcard/screenshot.png'
]);

// Pull the file:
const pull = spawn('adb', [
  'pull', '/sdcard/screenshot.png', screenshotPath
]);
```

This would give you **real-time screenshots** of exactly what's on screen, including DRM content, instead of extracting frames from media files.
