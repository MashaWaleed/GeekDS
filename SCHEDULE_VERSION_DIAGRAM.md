# Schedule Version Mismatch - Visual Explanation

## BEFORE FIX (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│  Android App Startup                                            │
│  lastAllSchedulesVersion = 0                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Heartbeat #1                                                   │
│  POST /api/devices/238/heartbeat                                │
│  Body: { versions: { all_schedules: 0 } }                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Heartbeat Handler                                      │
│  SQL: SELECT MAX(EXTRACT(EPOCH FROM updated_at)*1000)           │
│       FROM schedules WHERE device_id = 238                      │
│                                                                 │
│  Result: 1759441399133  (latest schedule timestamp)            │
│  Response: { new_versions: { all_schedules: 1759441399133 } }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android Detects Change                                         │
│  Log: "All schedules version changed: 0 -> 1759441399133"      │
│  Action: Trigger fetchDeviceSchedule()                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fetch All Schedules                                            │
│  GET /api/devices/238/schedules/all                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Schedules Handler (BROKEN)                             │
│  Returns 3 schedules:                                           │
│    - Schedule 1: version = 1759441399133                        │
│    - Schedule 2: version = 1759441398000                        │
│    - Schedule 3: version = 1759441401000                        │
│                                                                 │
│  ❌ WRONG CALCULATION:                                          │
│  aggregateVersion = SUM(1759441399133, 1759441398000,           │
│                        1759441401000)                           │
│                  = 5278324098133                                │
│                                                                 │
│  Response: { version: 5278324098133, schedules: [...] }        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android Caches Schedules                                       │
│  lastAllSchedulesVersion = 5278324098133  ⚠️ WRONG VALUE!       │
│  Log: "Cached 3 schedules (version 5278324098133)..."           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Heartbeat #2 (20 seconds later)                                │
│  POST /api/devices/238/heartbeat                                │
│  Body: { versions: { all_schedules: 5278324098133 } }          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Heartbeat Handler                                      │
│  SQL: SELECT MAX(...)  ← Still returns 1759441399133            │
│                                                                 │
│  Server version: 1759441399133                                  │
│  Client version: 5278324098133                                  │
│  They don't match! ❌                                           │
│                                                                 │
│  Response: { new_versions: { all_schedules: 1759441399133 } }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android Detects "Change" (FALSE POSITIVE)                      │
│  Log: "All schedules version changed:                           │
│        5278324098133 -> 1759441399133"                          │
│  Action: Trigger fetchDeviceSchedule() again...                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ♻️  INFINITE LOOP ♻️
                  (Repeats every 20 seconds)
```

---

## AFTER FIX (Working)

```
┌─────────────────────────────────────────────────────────────────┐
│  Android App Startup                                            │
│  lastAllSchedulesVersion = 0                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Heartbeat #1                                                   │
│  POST /api/devices/238/heartbeat                                │
│  Body: { versions: { all_schedules: 0 } }                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Heartbeat Handler                                      │
│  SQL: SELECT MAX(EXTRACT(EPOCH FROM updated_at)*1000)           │
│       FROM schedules WHERE device_id = 238                      │
│                                                                 │
│  Result: 1759441399133  (latest schedule timestamp)            │
│  Response: { new_versions: { all_schedules: 1759441399133 } }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android Detects Change                                         │
│  Log: "All schedules version changed: 0 -> 1759441399133"      │
│  Action: Trigger fetchDeviceSchedule()                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Fetch All Schedules                                            │
│  GET /api/devices/238/schedules/all                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Schedules Handler (FIXED)                              │
│  Returns 3 schedules:                                           │
│    - Schedule 1: version = 1759441399133                        │
│    - Schedule 2: version = 1759441398000                        │
│    - Schedule 3: version = 1759441401000                        │
│                                                                 │
│  ✅ CORRECT CALCULATION:                                        │
│  aggregateVersion = MAX(1759441399133, 1759441398000,           │
│                        1759441401000)                           │
│                  = 1759441401000                                │
│                                                                 │
│  Response: { version: 1759441401000, schedules: [...] }        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android Caches Schedules                                       │
│  lastAllSchedulesVersion = 1759441401000  ✅ CORRECT!           │
│  Log: "Cached 3 schedules (version 1759441401000)..."           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Heartbeat #2 (20 seconds later)                                │
│  POST /api/devices/238/heartbeat                                │
│  Body: { versions: { all_schedules: 1759441401000 } }          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend Heartbeat Handler                                      │
│  SQL: SELECT MAX(...)  ← Returns 1759441401000                  │
│                                                                 │
│  Server version: 1759441401000                                  │
│  Client version: 1759441401000                                  │
│  ✅ THEY MATCH!                                                 │
│                                                                 │
│  Response: { new_versions: { all_schedules: 1759441401000 } }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Android: No Change Detected                                    │
│  Log: "All schedules version unchanged (1759441401000),         │
│        skipping fetch"                                          │
│  Action: Skip fetch, use cached schedules ✅                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                         💤 IDLE 💤
              (No unnecessary fetches until real change)
```

---

## Key Difference

### BEFORE FIX:
- **Heartbeat:** Uses `MAX(updated_at)` = `1759441399133`
- **schedules/all:** Uses `SUM(updated_at)` = `5278324098133`
- **Result:** ❌ Never match → constant re-fetching

### AFTER FIX:
- **Heartbeat:** Uses `MAX(updated_at)` = `1759441401000`
- **schedules/all:** Uses `Math.max(versions)` = `1759441401000`
- **Result:** ✅ Always match → fetch only when actually changed

## Code Change Summary

**File:** `backend/src/devices.ts` (Line 590-593)

```diff
  const aggregateVersion = schedules.length > 0 
-   ? schedules.reduce((sum, s) => sum + s.version, 0)  // ❌ SUM
+   ? Math.max(...schedules.map(s => s.version))        // ✅ MAX
    : 0;
```

**Impact:** One-line change ensures version consistency across all endpoints!
