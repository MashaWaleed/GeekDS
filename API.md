# GeekDS CMS API Documentation

## Devices

### Register Device
- **POST** `/api/devices`
- **Body:**
```json
{
  "name": "TV Box 1",
  "ip": "192.168.1.101"
}
```
- **Response:** Device object

### List Devices
- **GET** `/api/devices`
- **Response:** Array of device objects

### Update Device Status (Heartbeat)
- **PATCH** `/api/devices/:id`
- **Body:**
```json
{
  "status": "online",
  "current_media": "promo.mp4",
  "system_info": { "cpu": 20, "mem": 50, "disk": "2GB" }
}
```
- **Response:** Updated device object
- **Note:** Devices are automatically marked offline if no heartbeat received within 3 minutes

### Send Command to Device
- **POST** `/api/devices/:id/command`
- **Body:**
```json
{
  "command": "reboot",
  "parameters": {}
}
```
- **Response:** Command object

### List Pending Commands for Device
- **GET** `/api/devices/:id/commands`
- **Response:** Array of command objects

---

## Media

### List Media Files
- **GET** `/api/media`
- **Response:** Array of media file objects

### Upload Media File
- **POST** `/api/media`
- **Form Data:**
  - `file`: (file upload)
- **Response:** Media file object

### Download Media File
- **GET** `/api/media/:filename`
- **Response:** File stream

### Delete Media File
- **DELETE** `/api/media/:id`
- **Response:** `{ "success": true }`

---

## Playlists

### List Playlists
- **GET** `/api/playlists`
- **Response:** Array of playlist objects with versioning
```json
[
  {
    "id": 1,
    "name": "Morning Ads",
    "updated_at": "2024-07-25T13:45:30.123Z"
  }
]
```

### Create Playlist
- **POST** `/api/playlists`
- **Body:**
```json
{
  "name": "Morning Ads",
  "media_files": [1, 2, 3]
}
```
- **Response:** Playlist object

### Get Playlist Details
- **GET** `/api/playlists/:id`
- **Response:** Playlist object with media files and versioning
```json
{
  "id": 1,
  "name": "Morning Ads",
  "updated_at": "2024-07-25T13:45:30.123Z",
  "media_files": [1, 2, 3],
  "media_details": [
    {
      "id": 1,
      "filename": "video1.mp4",
      "saved_filename": "abc123.mp4",
      "type": "video/mp4",
      "duration": 30
    }
  ]
}
```

### Update Playlist
- **PATCH** `/api/playlists/:id`
- **Body:**
```json
{
  "name": "New Name",
  "media_files": [2, 3]
}
```
- **Response:** `{ "success": true }`

### Delete Playlist
- **DELETE** `/api/playlists/:id`
- **Response:** `{ "success": true }`

---

## Schedules

### List Schedules
- **GET** `/api/schedules`
- **Response:** Array of schedule objects with versioning
```json
[
  {
    "id": 1,
    "device_id": 1,
    "playlist_id": 1,
    "start_time": "2024-07-25T09:00:00Z",
    "end_time": "2024-07-25T12:00:00Z",
    "repeat": "daily",
    "updated_at": "2024-07-25T13:45:30.123Z"
  }
]
```

### Create Schedule
- **POST** `/api/schedules`
- **Body:**
```json
{
  "device_id": 1,
  "playlist_id": 1,
  "start_time": "2024-06-01T09:00:00Z",
  "end_time": "2024-06-01T12:00:00Z",
  "repeat": "daily"
}
```
- **Response:** Schedule object

### Update Schedule
- **PATCH** `/api/schedules/:id`
- **Body:** (same as create)
- **Response:** `{ "success": true }`

### Delete Schedule
- **DELETE** `/api/schedules/:id`
- **Response:** `{ "success": true }`

---

## Notes
- All endpoints return JSON unless otherwise noted.
- For file uploads, use `multipart/form-data`.
- For authentication, add a layer as needed (not included in MVP). 