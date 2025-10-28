#!/bin/bash
# Simple load test runner - no fancy terminal stuff

cd "$(dirname "$0")"

# Verify backend is running
if ! docker ps | grep -q geekds-backend; then
    echo "Error: Backend is not running!"
    echo "Start with: docker-compose up -d"
    exit 1
fi

# Run the load test
echo "Starting load test..."
echo "Press Ctrl+C to stop"
echo ""

exec node load-test.js
