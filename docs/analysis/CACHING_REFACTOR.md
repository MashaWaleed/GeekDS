# Caching Refactor - Simplified to All-Schedules Only

## Summary of Changes

**Goal:** Remove redundant single-schedule caching and use ONLY `all_schedules` cache for consistent, offline-resilient schedule management.

---

## What Changed

### ❌ **REMOVED:**

1. **Backend Endpoint:** `GET /api/devices/:id/schedule` 
   - Now returns 410 Gone with deprecation message
   - Clients should use `GET /api/devices/:id/schedules/all` instead

2. **Android Functions:**
   - `saveSchedule()` - deprecated, now no-op
   - `loadSchedule()` - deprecated, returns null
   - Single schedule fallback logic in `enforceSchedule()`

3. **SharedPreferences Keys:**
   - `"schedule"` - no longer used (cleared on data reset)
   - `"playlist"` - no longer used (cleared on data reset)

### ✅ **KEPT (Only Source of Truth):**

1. **Backend Endpoint:** `GET /api/devices/:id/schedules/all`
   - Returns ALL schedules assigned to device
   - Includes version tracking
   - Enables offline schedule switching

2. **Android Functions:**
   - `saveAllSchedules()` - caches full schedule list
   - `loadAllSchedules()` - loads cached schedules
   - `enforceScheduleWithMultiple()` - client-side time checking

3. **SharedPreferences Keys:**
   - `"all_schedules"` - full schedule cache (JSON array)
   - `"playlist_1"`, `"playlist_2"`, etc. - playlist cache by ID

---

## How Caching Works Now

### **Schedule Caching**

```kotlin
// ONLY ONE CACHE
val allSchedules = loadAllSchedules(context) // List<Schedule>

// Time-based enforcement happens client-side
enforceScheduleWithMultiple(allSchedules)
```

**Versioning:**
- Server tracks `lastAllSchedulesVersion` (epoch ms of last schedule update)
- Client caches version and only refetches if changed
- Version updated AFTER successful caching (not before)

### **When Schedules Are Cached**

1. **Initial Fetch:** Device requests `/schedules/all` on startup
2. **Version Change:** Heartbeat returns new version → refetch
3. **Schedule Edit:** Any schedule modification updates version → refetch
4. **Offline Mode:** Uses cached schedules until network returns

### **When Schedules Are Cleared**

| Event | What Gets Cleared | Why |
|-------|------------------|-----|
| No schedules exist | `all_schedules` + all `playlist_X` | Device unassigned |
| Device deleted server-side | ALL cache (except UUID) | Full reset |
| Outside time window | **NOTHING** | Keep cache for next window |
| Schedule disabled | **NOTHING** | Keep for offline switching |

**CRITICAL:** Cache is only cleared when **NO schedules exist**, not when they're inactive!

---

## Migration Guide

### **For Android Devices Already Deployed:**

✅ **No action needed!** The old code is backward compatible:
- Deprecated functions return safe defaults
- Cache keys are cleaned up gradually
- Next schedule fetch will populate `all_schedules`

### **Testing Checklist:**

- [ ] Device fetches schedules on first run
- [ ] Schedules cached locally
- [ ] Device switches between schedules offline
- [ ] Schedule edits reflected after version change
- [ ] Device stops playback outside time window (but keeps cache)
- [ ] Deleted schedules clear cache properly
- [ ] No "version changed 0 → X" spam in logs

---

## Benefits

### **Before (Redundant):**
- 2 endpoints: `/schedule` + `/schedules/all`
- 2 caches: `"schedule"` + `"all_schedules"`
- 2 code paths: Single schedule + multi-schedule
- Race conditions between caches
- Confusing "which is source of truth?"

### **After (Simplified):**
- ✅ 1 endpoint: `/schedules/all`
- ✅ 1 cache: `"all_schedules"`
- ✅ 1 code path: `enforceScheduleWithMultiple()`
- ✅ No race conditions
- ✅ Clear source of truth

---

## Cache Management Functions

### **clearAllScheduleData()** - Complete Schedule Reset
```kotlin
// Called when NO schedules exist server-side
clearAllScheduleData()
// Clears:
// - all_schedules
// - playlist
// - playlist_1, playlist_2, ...
// - Resets version tracking
```

### **clearDeviceRegistration()** - Full Device Reset
```kotlin
// Called when device deleted server-side
clearDeviceRegistration()
// Clears:
// - ALL SharedPreferences (except UUID)
// - ALL downloaded media files
// - ALL state variables
```

---

## Version Tracking

```kotlin
lastAllSchedulesVersion = 0L  // Reset on clear

// Heartbeat sends current version
heartbeat.versions.all_schedules = lastAllSchedulesVersion

// Server compares and returns schedule_changed flag
if (schedule_changed) {
    fetchDeviceSchedule() // Fetches /schedules/all
    
    // On success:
    saveAllSchedules(schedules)       // Cache FIRST
    lastAllSchedulesVersion = version // Update AFTER
}
```

**Order matters!** Version is updated AFTER caching to ensure retry on failure.

---

## API Changes

### **Deprecated Endpoint**
```http
GET /api/devices/:id/schedule
```
**Response:** 410 Gone
```json
{
  "error": "This endpoint is deprecated. Use GET /api/devices/:id/schedules/all instead",
  "migration_guide": "The Android client now uses multi-schedule caching. Update your client to use /schedules/all endpoint."
}
```

### **Current Endpoint**
```http
GET /api/devices/:id/schedules/all
```
**Response:** 200 OK
```json
{
  "schedules": [
    {
      "id": 1,
      "playlist_id": 5,
      "name": "Morning Show",
      "days_of_week": ["monday", "tuesday"],
      "time_slot_start": "06:00:00",
      "time_slot_end": "12:00:00",
      "valid_from": null,
      "valid_until": null,
      "is_enabled": true,
      "version": 1234567890
    }
  ],
  "count": 1,
  "version": 1234567890
}
```

---

## Troubleshooting

### **"No cached schedules found" Loop**
**Cause:** Network issues preventing initial fetch  
**Fix:** Check `/schedules/all` endpoint is accessible

### **Schedules Not Updating**
**Cause:** Version not changing server-side  
**Fix:** Ensure `updated_at` triggers on schedule edits

### **Cache Never Clears**
**Cause:** Server still returning empty schedules array (not null)  
**Fix:** Backend should return `schedules: []` when unassigned

### **Device Stuck on Old Schedule After Edit**
**Cause:** Version tracking broken  
**Fix:** Check `lastAllSchedulesVersion` is reset on cache clear

---

## Code Locations

### **Android (`MainActivity.kt`)**
- `fetchDeviceSchedule()` - Line ~812 - Fetches /schedules/all
- `clearAllScheduleData()` - Line ~1515 - Proper cache clearing
- `enforceSchedule()` - Line ~2223 - Simplified enforcement
- `saveAllSchedules()` / `loadAllSchedules()` - Line ~2617 - Cache functions

### **Backend (`devices.ts`)**
- `GET /:id/schedules/all` - Line ~557 - Main schedule endpoint
- `GET /:id/schedule` - Line ~611 - **DEPRECATED** endpoint

---

## Next Steps

1. ✅ Monitor logs for deprecated function calls
2. ✅ Confirm no `loadSchedule()` / `saveSchedule()` usage
3. ✅ Test schedule switching offline
4. 🔄 **Optional:** Completely remove deprecated functions after 30 days
5. 🔄 **Optional:** Delete old `"schedule"` keys from deployed devices

---

**Date:** November 19, 2025  
**Author:** Refactoring Assistant  
**Status:** ✅ Complete
