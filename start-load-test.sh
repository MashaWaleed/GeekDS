#!/bin/bash

# Quick Start Load Test Script
# Simple version without tmux for Hyprland/special terminals

echo "🚀 GeekDS Load Test Quick Start"
echo "================================"
echo ""

# Check if backend is running
if ! docker ps | grep -q geekds-backend; then
    echo "❌ Backend is not running!"
    echo "Start it with: docker-compose up -d"
    exit 1
fi

# Check if test data exists
device_count=$(docker exec geekds-db-1 psql -U postgres -d cms -t -c "SELECT COUNT(*) FROM devices WHERE name LIKE 'LT Device%';" 2>/dev/null | tr -d ' ')

if [ -z "$device_count" ] || [ "$device_count" -lt 190 ]; then
    echo "⚠️  Warning: Only $device_count test devices found (expected ~199)"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "✅ Backend is running"
echo "✅ Found $device_count test devices"
echo ""
echo "📝 Manual Start Instructions:"
echo ""
echo "Terminal 1 (Monitoring - Optional):"
echo "  ./monitor.sh monitor 10"
echo ""
echo "Terminal 2 (Load Test):"
echo "  node load-test.js"
echo ""
echo "Or just run the load test now in this terminal:"
echo ""

read -p "Start load test? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting load test... (Press Ctrl+C to stop)"
    echo ""
    node load-test.js
else
    echo ""
    echo "Run 'node load-test.js' when ready."
fi
