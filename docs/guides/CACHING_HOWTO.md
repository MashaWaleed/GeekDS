# Schedule Caching - How It Works Now

## ✅ Single Source of Truth

### **ONLY ONE CACHE**: `all_schedules`

```
Server → all_schedules cache → Client-side time math → Play/Stop
```

---

## 📋 What Gets Cached Where

| Data Type | Cache Key | Type | Cleared When |
|-----------|-----------|------|--------------|
| **All Schedules** | `"all_schedules"` | JSON Array | NO schedules exist |
| **Cached Playlists** | `"playlist_1"`, `"playlist_2"` | JSON Object | NO schedules exist |
| **Device UUID** | `"device_uuid"` | String | **NEVER** |
| **Device ID** | `"device_id"` | Int | Device deleted |
| **Device Name** | `"device_name"` | String | Device deleted |

### **Deprecated (No Longer Used)**
- ❌ `"schedule"` - single schedule cache
- ❌ `"playlist"` - current playlist cache

---

## 🔄 Cache Lifecycle

### **1. Initial Fetch (Device Startup)**
```
1. Device sends heartbeat
2. Server: schedule_changed = true (version 0 → new)
3. Device calls GET /api/devices/:id/schedules/all
4. Server returns: { schedules: [...], version: 1234567890 }
5. Device saves to "all_schedules" cache
6. Device pre-downloads all playlists
7. Device runs enforceScheduleWithMultiple()
```

### **2. Schedule Updated (Edit Time/Days/Playlist)**
```
1. Admin edits schedule in dashboard
2. Database updated_at timestamp changes
3. New version = EXTRACT(EPOCH FROM MAX(updated_at)) * 1000
4. Device heartbeat: versions.all_schedules = old_version
5. Server: schedule_changed = true (version mismatch)
6. Device refetches /schedules/all
7. Cache updated with new schedules
8. Device re-evaluates active schedule
```

### **3. Schedule Deleted (All Schedules Removed)**
```
1. Admin deletes last schedule
2. Device fetches /schedules/all
3. Server returns: { schedules: [], count: 0, version: 0 }
4. Device calls clearAllScheduleData()
5. Clears all_schedules + all playlist_X
6. Resets version tracking to 0
7. Shows standby screen
```

### **4. Outside Time Window**
```
1. Clock hits 12:26, schedule ends at 12:25
2. enforceScheduleWithMultiple() runs
3. Finds no active schedule for current time
4. Stops playback, shows standby
5. ✅ KEEPS all_schedules cache! (for next window)
6. Version tracking unchanged
```

---

## 🧹 What Gets Cleared When

### **clearAllScheduleData()** - No Schedules Exist
Called when server returns empty schedules array.

**Clears:**
- ✅ `"all_schedules"`
- ✅ `"playlist"` (legacy)
- ✅ `"playlist_1"`, `"playlist_2"`, ... (all cached playlists)
- ✅ Version tracking → 0

**Keeps:**
- ✅ `"device_uuid"` (permanent)
- ✅ `"device_id"`
- ✅ `"device_name"`
- ✅ Downloaded media files

---

### **clearDeviceRegistration()** - Device Deleted
Called when heartbeat gets 404 (device deleted server-side).

**Clears:**
- ✅ ALL SharedPreferences (except `"device_uuid"`)
- ✅ ALL downloaded media files
- ✅ ALL state variables
- ✅ Shows registration screen

**Keeps:**
- ✅ `"device_uuid"` (for re-registration)

---

## 🔍 Version Tracking

```kotlin
// Device tracks last known version
lastAllSchedulesVersion: Long = 0

// Heartbeat sends version
heartbeat {
  versions: {
    all_schedules: lastAllSchedulesVersion
  }
}

// Server calculates current version
currentVersion = MAX(schedules.updated_at) as epoch milliseconds

// Server compares
schedule_changed = (currentVersion != client_version)

// Device refetches if changed
if (schedule_changed) {
  fetch /schedules/all
  saveAllSchedules(schedules)        // Cache FIRST
  lastAllSchedulesVersion = version  // Update AFTER
}
```

**Why cache FIRST?** If caching fails, version stays old → retry next heartbeat.

---

## 📡 Offline Behavior

### **Device Goes Offline**
```
1. Last fetched schedules cached in "all_schedules"
2. Every 3 seconds: enforceScheduleWithMultiple(cached_schedules)
3. Client-side time math determines active schedule
4. Device switches between schedules without server
5. Pre-downloaded playlists available offline
6. Continues until network returns
```

### **Device Comes Back Online**
```
1. Heartbeat resumes
2. Server sends latest version
3. If version changed while offline → refetch
4. If version same → keep using cache
5. No playback interruption
```

---

## 🐛 Common Issues Fixed

### **Issue #1: Cache Cleared When Outside Time Window**
**Before:** `clearLocalData()` called when schedule inactive  
**After:** Only clears when NO schedules exist  
**Fix:** Server returns schedules but inactive → keep cache

### **Issue #2: Version Updated Before Caching**
**Before:** `lastAllSchedulesVersion = version` then `save()`  
**After:** `save()` then `lastAllSchedulesVersion = version`  
**Fix:** If save fails, version stays old → retry

### **Issue #3: Redundant Caches Out of Sync**
**Before:** `"schedule"` vs `"all_schedules"` - which is real?  
**After:** Only `"all_schedules"` exists  
**Fix:** One source of truth

### **Issue #4: Deprecated Functions Still Called**
**Before:** Mix of `loadSchedule()` and `loadAllSchedules()`  
**After:** `loadSchedule()` returns null, logs warning  
**Fix:** Forces migration to new code path

---

## 📊 Cache Size Estimates

| Device Scenario | Cache Size |
|-----------------|------------|
| 1 schedule, 1 playlist (5 videos) | ~500 KB |
| 3 schedules, 3 playlists (15 videos total) | ~1.5 MB |
| 10 schedules, 5 playlists (30 videos) | ~3 MB |

**Note:** Media files are bulk of storage (10-100 MB per video).

---

## ✅ Verification Checklist

### **Fresh Device**
- [ ] Fetches /schedules/all on first heartbeat
- [ ] Caches to "all_schedules"
- [ ] Pre-downloads all playlists
- [ ] Starts playing if in time window

### **Schedule Edited**
- [ ] Version changes server-side
- [ ] Heartbeat detects version mismatch
- [ ] Refetches schedules
- [ ] Updates cache
- [ ] Re-evaluates playback

### **Schedule Deleted**
- [ ] Server returns empty array
- [ ] clearAllScheduleData() called
- [ ] Cache fully cleared
- [ ] Version reset to 0
- [ ] Standby screen shown

### **Outside Time Window**
- [ ] Playback stops
- [ ] Cache remains intact
- [ ] Version tracking unchanged
- [ ] Resumes when time window starts

### **Offline**
- [ ] Uses cached schedules
- [ ] Switches schedules client-side
- [ ] Plays pre-downloaded media
- [ ] Syncs when back online

---

**Last Updated:** November 19, 2025
