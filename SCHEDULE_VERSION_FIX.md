# Schedule Version Mismatch Fix

## Date: October 6, 2025

## Problem Summary

The application logs showed constant schedule version oscillation despite no actual schedule changes:

```
10-06 22:49:44.159  I GeekDS  : All schedules version changed: 0 -> 1759441399133
10-06 22:49:44.317  I GeekDS  : Cached 3 schedules (version 5278324098316) for offline switching
10-06 22:49:54.121  I GeekDS  : All schedules version changed: 5278324098316 -> 1759441399133
10-06 22:49:54.146  D GeekDS  : All schedules version unchanged (5278324098316), skipping fetch
10-06 22:50:04.039  I GeekDS  : All schedules version changed: 5278324098316 -> 1759441399133
```

**The pattern:**
- Heartbeat reports version: `1759441399133`
- App caches version: `5278324098316`
- Versions never match → constant "version changed" messages

## Root Cause

**Inconsistent version calculation between two backend endpoints:**

### 1. `/api/devices/:id/heartbeat` (Line 484-488 in devices.ts)
```typescript
const allSchedulesQuery = await pool.query(
  `SELECT MAX(EXTRACT(EPOCH FROM updated_at)*1000) AS max_version
   FROM schedules
   WHERE device_id = $1 AND is_enabled = true`,
  [id]
);
allSchedulesVersion = Math.floor(allSchedulesQuery.rows[0]?.max_version || 0);
```
**Uses:** `MAX(updated_at)` - Returns the most recent schedule update timestamp

### 2. `/api/devices/:id/schedules/all` (Line 590-593 in devices.ts) - BEFORE FIX
```typescript
const aggregateVersion = schedules.length > 0 
  ? schedules.reduce((sum, s) => sum + s.version, 0)  // ❌ WRONG!
  : 0;
```
**Used:** `SUM(updated_at)` - Returns the sum of all schedule update timestamps

## Why This Broke

Given 3 schedules with timestamps:
- Schedule 1: `1728241399133` (updated Oct 6, 22:49)
- Schedule 2: `1728241399000` (updated Oct 6, 22:49)
- Schedule 3: `1728241400000` (updated Oct 6, 22:50)

**Heartbeat calculation (MAX):**
```
allSchedulesVersion = MAX(1728241399133, 1728241399000, 1728241400000)
                    = 1728241400000  ✅ Latest timestamp
```

**schedules/all calculation (SUM) - BEFORE FIX:**
```
aggregateVersion = SUM(1728241399133, 1728241399000, 1728241400000)
                 = 5184724198133  ❌ Sum of all timestamps
```

**Result:** The two endpoints return completely different version numbers, so the app always sees a "version change" even when nothing changed!

## The Fix

**Changed `/api/devices/:id/schedules/all` to use MAX (consistent with heartbeat):**

```typescript
// AFTER FIX (Line 590-593 in devices.ts)
const aggregateVersion = schedules.length > 0 
  ? Math.max(...schedules.map(s => s.version))  // ✅ CORRECT! Matches heartbeat
  : 0;
```

Now both endpoints use the same calculation:
- **Heartbeat:** `MAX(updated_at)` from SQL
- **schedules/all:** `Math.max(...versions)` from JavaScript

## Expected Behavior After Fix

1. **First heartbeat after restart:**
   ```
   All schedules version changed: 0 -> 1759441399133
   ```
   (Normal - app has version 0 on startup)

2. **Fetch schedules:**
   ```
   Cached 3 schedules (version 1759441399133) for offline switching
   ```
   (Now matches heartbeat version!)

3. **Subsequent heartbeats:**
   ```
   All schedules version unchanged (1759441399133), skipping fetch
   ```
   (No more oscillation - versions match!)

4. **When schedule actually changes:**
   ```
   All schedules version changed: 1759441399133 -> 1759441450000
   ```
   (Legitimate version change triggers fetch)

## Deployment Steps

1. ✅ Updated `/api/devices/:id/schedules/all` endpoint in `backend/src/devices.ts`
2. ⏳ Restart backend server to apply changes
3. ⏳ Test with Android app - verify no more false "version changed" messages
4. ⏳ Monitor logs to confirm versions stay consistent between heartbeats

## Verification Commands

After deploying backend:

```bash
# Restart backend
cd backend
npm run dev  # or restart production server

# Monitor backend logs for version calculations
# Check that heartbeat and /schedules/all return same version

# On Android device, watch logcat:
adb logcat -s GeekDS:* | grep "version"
```

Expected log pattern (healthy):
```
I GeekDS  : All schedules version changed: 0 -> 1759441399133      (startup)
I GeekDS  : Cached 3 schedules (version 1759441399133) ...         (matches!)
D GeekDS  : All schedules version unchanged (1759441399133) ...    (no oscillation)
D GeekDS  : All schedules version unchanged (1759441399133) ...    (no oscillation)
```

## Why MAX is Better Than SUM

1. **Logical:** The "latest update" time is intuitive - any schedule change updates this timestamp
2. **Stable:** MAX doesn't grow unbounded like SUM would over time
3. **Standard:** Typical versioning uses timestamps, not sums
4. **Consistent:** Already used by heartbeat endpoint - just needed to align schedules/all

## Files Modified

- ✅ `backend/src/devices.ts` (Line 590-593)
  - Changed: `reduce((sum, s) => sum + s.version, 0)` → `Math.max(...schedules.map(s => s.version))`

## Testing Checklist

- [ ] Backend restarts without errors
- [ ] `/api/devices/:id/schedules/all` returns same version as heartbeat
- [ ] Android app stops showing false "version changed" messages
- [ ] Actual schedule edits still trigger version changes correctly
- [ ] Offline mode still works (cached schedules used when server down)
- [ ] Multi-schedule switching works (enforce checks cached data)

## Related Issues Fixed

This fix also resolves:
- Unnecessary network traffic (constant re-fetching of unchanged schedules)
- Battery drain (processing "changes" that don't exist)
- Log spam (every 20s heartbeat showed "version changed")
- Cache invalidation issues (cache never considered "valid" because versions always mismatched)
