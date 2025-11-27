#!/bin/bash

# Script to add authenticated API import to all component files

FILES=(
  "/home/masha/projects/GeekDS/frontend/src/components/DeviceGrid.js"
  "/home/masha/projects/GeekDS/frontend/src/components/MediaManager.js"
  "/home/masha/projects/GeekDS/frontend/src/components/Playlists.js"
  "/home/masha/projects/GeekDS/frontend/src/components/Schedules.js"
)

for file in "${FILES[@]}"; do
  echo "Processing $file..."
  
  # Check if file already has the import
  if ! grep -q "import { api } from" "$file"; then
    # Add import at the beginning after existing imports
    sed -i "1i import { api } from '../utils/api';" "$file"
    echo "Added API import to $file"
  else
    echo "API import already exists in $file"
  fi
done

echo "Done!"
