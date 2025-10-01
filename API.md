# GeekDS CMS API Documentation

This document reflects the current UUID-first device registration flow, scheduling model, and supporting endpoints.

## Devices

### Registration Flow (UUID-first)
- Device generates a durable `uuid` and polls:
  - GET `/api/devices/check-registration/by-uuid/:uuid`
  - If not found, it may also poll by IP:
    - GET `/api/devices/check-registration/:ip`
- Dashboard registers device via a code flow:
  - POST `/api/devices/register-request`
    - Body: `{ "ip": "192.168.1.101" }`
    - Response: `{ "code": "123456" }`
  - POST `/api/devices/register-device`
    - Body: `{ "code": "123456", "name": "Lobby TV" }`
    - Response: `{ device: { ... }, message: "Device registered successfully" }`
- Auto-claim or recreate device by UUID:
  - POST `/api/devices/claim`
    - Body: `{ "uuid": "<uuid>", "name": "Device", "ip": "192.168.1.101", "system_info": { ... } }`
    - Response: `{ device: { ... }, claimed: boolean, created?: boolean }`

### List Devices
- GET `/api/devices`
- Response: Array of device objects

### Get Device
- GET `/api/devices/:id`

### Update Device (Dashboard)
- PUT `/api/devices/:id`
- Body: `{ "name": "New Name", "ip": "192.168.1.101" }`

### Update Device Status (Heartbeat)
- PATCH `/api/devices/:id`
- Body:
```json
{
  "status": "online",
  "current_media": "standby",
  "system_info": { "cpu": 20, "memory": 50, "disk": "2GB" },
  "ip": "192.168.1.101",
  "uuid": "<device-uuid>"
}
```
- Response: Updated device object; returns 404 if device row no longer exists (client should re-register/claim).
- Note: Backend marks devices offline if no heartbeat within ~45s (1.5x 30s heartbeat).

### Registration Polling Endpoints
- GET `/api/devices/check-registration/by-uuid/:uuid`
  - Response: `{ registered: true, device }` or `{ registered: false }`
- GET `/api/devices/check-registration/:ip`
  - Response: `{ registered: true, device }` or `{ registered: false }`

### Commands and Screenshots
- Poll pending commands for device:
  - GET `/api/devices/:id/commands/poll`
  - Response: `{ commands: [{ type: "screenshot_request", request_id, timestamp }] }`
- Request screenshot from a device (dashboard):
  - POST `/api/devices/:id/screenshot`
  - Response waits up to ~15s; returns status or timeout
- Device uploads screenshot:
  - POST `/api/devices/:id/screenshot/upload` (multipart form-data, field `screenshot`)
- Get latest screenshot for a device:
  - GET `/api/devices/:id/screenshot/latest`
- Check screenshot availability:
  - GET `/api/devices/:id/screenshot/status`

---

## Media

### List Media Files
- GET `/api/media`

### Upload Media File
- POST `/api/media`
- Form Data:
  - `file`: (file upload)

### Download Media File
- GET `/api/media/:filename`

### Delete Media File
- DELETE `/api/media/:id`

---

## Playlists

### List Playlists
- GET `/api/playlists`
- Response includes versioning via `updated_at`.

### Create Playlist
- POST `/api/playlists`
- Body:
```json
{ "name": "Morning Ads", "media_files": [1, 2, 3] }
```

### Get Playlist Details
- GET `/api/playlists/:id`
- Response includes `media_details` and `updated_at`.

### Update Playlist
- PATCH `/api/playlists/:id`

### Delete Playlist
- DELETE `/api/playlists/:id`

---

## Schedules

Schedules are moving to a UUID-first device linkage to survive device row re-creation.

### Model (current)
- Table `schedules` fields:
  - `id` int
  - `device_id` int (legacy)
  - `playlist_id` int
  - `name` text
  - `days_of_week` text[] (e.g., ["monday", ...])
  - `time_slot_start` time ("HH:mm")
  - `time_slot_end` time ("HH:mm")
  - `valid_from` date (nullable)
  - `valid_until` date (nullable)
  - `is_enabled` boolean
  - `updated_at` timestamp

### Recommended contract (UUID-first)
- Prefer `device_uuid` (uuid) to link schedules to devices.
- During migration, backend can accept both and resolve `device_uuid` from `device_id`.

### List Schedules
- GET `/api/schedules`
- Response rows include joined `device_name`, `playlist_name`, and timestamps (`schedule_updated_at`, `playlist_updated_at`).

### Create Schedule
- POST `/api/schedules`
- Body (prefer uuid):
```json
{
  "device_uuid": "<uuid>",
  "device_id": 123,              
  "playlist_id": 1,
  "name": "Morning Slot",
  "days_of_week": ["monday", "tuesday"],
  "time_slot_start": "09:00",
  "time_slot_end": "12:00",
  "valid_from": "2025-09-01",
  "valid_until": null,
  "is_enabled": true
}
```
- Overlap rules: server rejects overlapping schedules per device for enabled entries and active dates.

### Update Schedule
- PATCH `/api/schedules/:id`
- Same fields as create; partial updates allowed. Overlap checks apply.

### Delete Schedule
- DELETE `/api/schedules/:id`

### Device-specific Schedules (debug)
- GET `/api/schedules/device/:deviceId`

---

## Migration Notes (Device UUID for schedules)
- Add `device_uuid` (uuid) to `schedules` and backfill from `devices.uuid` using `device_id`.
- Add FK: `schedules.device_uuid` → `devices.uuid` with `ON DELETE CASCADE`.
- Index `schedules(device_uuid)`.
- Keep `device_id` for backwards compatibility temporarily; plan removal after client updates.

---

## Notes
- All endpoints return JSON unless otherwise noted.
- For file uploads, use `multipart/form-data`.
- Authentication is basic/optional at the moment; add as needed.
 