#!/usr/bin/env python3
"""
Automated APK Update via Network ADB
Connects to all online devices and installs the latest APK
"""

import subprocess
import psycopg2
import time
import sys
from datetime import datetime

# Configuration
DB_NAME = "cms"
DB_USER = "postgres"
DB_HOST = "localhost"
APK_PATH = "backend/apk/app-debug.apk"
ADB_PORT = 5555

def run_adb_command(command, timeout=10):
    """Run an ADB command and return the result"""
    try:
        result = subprocess.run(
            command,
            timeout=timeout,
            capture_output=True,
            text=True,
            check=False
        )
        return result.returncode == 0, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out"
    except Exception as e:
        return False, "", str(e)

def get_online_devices():
    """Get all online devices from database"""
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            host=DB_HOST
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, ip, app_version 
            FROM devices 
            WHERE status = 'online' AND ip IS NOT NULL AND ip != 'unknown'
            ORDER BY id
        """)
        devices = cur.fetchall()
        cur.close()
        conn.close()
        return devices
    except Exception as e:
        print(f"❌ Database error: {e}")
        return []

def update_device(device_id, name, ip, current_version):
    """Update a single device via ADB"""
    print(f"\n{'='*60}")
    print(f"📱 Device: {name} (ID: {device_id})")
    print(f"   IP: {ip}")
    print(f"   Current version: {current_version}")
    print(f"{'='*60}")
    
    device_addr = f"{ip}:{ADB_PORT}"
    
    # Step 1: Connect
    print(f"🔌 Connecting to {device_addr}...")
    success, stdout, stderr = run_adb_command(
        ["adb", "connect", device_addr],
        timeout=10
    )
    
    if not success or "connected" not in stdout.lower():
        print(f"❌ Failed to connect: {stderr}")
        print(f"   Make sure ADB over network is enabled on the device")
        print(f"   Run once via USB: adb tcpip {ADB_PORT}")
        return False
    
    print(f"✅ Connected")
    
    # Step 2: Install APK
    print(f"📦 Installing APK...")
    success, stdout, stderr = run_adb_command(
        ["adb", "-s", device_addr, "install", "-r", "-t", APK_PATH],
        timeout=120  # 2 minutes for large APKs
    )
    
    if success and "Success" in stdout:
        print(f"✅ APK installed successfully!")
        print(f"   App will restart automatically")
        result = True
    else:
        print(f"❌ Installation failed:")
        print(f"   {stdout}")
        print(f"   {stderr}")
        result = False
    
    # Step 3: Disconnect
    print(f"🔌 Disconnecting...")
    run_adb_command(["adb", "disconnect", device_addr], timeout=5)
    
    return result

def main():
    print("=" * 60)
    print("🚀 GeekDS Automated APK Update via Network ADB")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Get devices
    print("📊 Fetching online devices from database...")
    devices = get_online_devices()
    
    if not devices:
        print("❌ No online devices found")
        sys.exit(1)
    
    print(f"✅ Found {len(devices)} online device(s)")
    print()
    
    # Confirm
    print("Devices to update:")
    for device_id, name, ip, version in devices:
        print(f"  - {name} ({ip}) - v{version}")
    print()
    
    response = input(f"Continue with update? [y/N]: ")
    if response.lower() != 'y':
        print("❌ Aborted by user")
        sys.exit(0)
    
    # Update devices
    print()
    success_count = 0
    failed_count = 0
    
    for device_id, name, ip, current_version in devices:
        try:
            if update_device(device_id, name, ip, current_version):
                success_count += 1
            else:
                failed_count += 1
        except KeyboardInterrupt:
            print("\n\n❌ Interrupted by user")
            break
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            failed_count += 1
        
        # Rate limiting between devices
        time.sleep(3)
    
    # Summary
    print()
    print("=" * 60)
    print("📊 Update Summary")
    print("=" * 60)
    print(f"✅ Success: {success_count}")
    print(f"❌ Failed:  {failed_count}")
    print(f"📱 Total:   {len(devices)}")
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

if __name__ == "__main__":
    main()
