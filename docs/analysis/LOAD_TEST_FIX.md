# Load Test Fix Summary

## Issues Found

You were absolutely right to question the test! There were **3 critical bugs**:

### 1. Wrong API Endpoint ❌
**Problem:**
```javascript
// WRONG - was using:
await makeRequest('/api/devices/${deviceId}', 'PATCH', body);

// CORRECT - should be:
await makeRequest('/api/devices/${deviceId}/heartbeat', 'PATCH', body);
```

**Why:** The backend has a specific `/heartbeat` endpoint for device heartbeats, not the generic `PATCH /:id`.

**Evidence from backend/src/devices.ts (line 374):**
```typescript
router.patch('/:id/heartbeat', async (req, res) => {
```

---

### 2. Invalid UUID Format ❌
**Problem:**
```javascript
// WRONG - was sending:
uuid: `test-uuid-${deviceNum}`  // e.g., "test-uuid-1"

// Database expects PostgreSQL UUID format:
uuid: "3def217c-bb63-4b39-8493-ad115b6f3a56"
```

**Why:** The `devices.uuid` column is type `uuid` (PostgreSQL), which requires RFC 4122 format (8-4-4-4-12 hex digits).

**The Error:**
```
ERROR: invalid input syntax for type uuid: "test-uuid-19"
CONTEXT: unnamed portal parameter $3 = '...'
```

**Backend code (line 510):**
```typescript
if (ip || name || uuid) {
  await pool.query(
    `UPDATE devices
     SET ip = COALESCE($1, ip),
         name = COALESCE($2, name),
         uuid = COALESCE($3, uuid)  // <-- Expects valid UUID
     WHERE id = $4`,
    [ip || null, name || null, uuid || null, id]
  );
}
```

---

### 3. Unnecessary UUID in Heartbeat ❌
**Problem:**
```javascript
// WRONG - was sending:
const body = {
  playback_state: 'playing',
  versions: versions,
  ip: `192.168.1.${100 + deviceNum}`,
  uuid: `test-uuid-${deviceNum}`  // <-- This triggers metadata update!
};
```

**Why:** Sending `uuid` in the heartbeat triggers an immediate database write to update the UUID, which:
- Defeats the purpose of batch updates
- Causes unnecessary database load
- Expects a valid UUID format

**Correct approach:**
```javascript
const body = {
  playback_state: 'playing',
  versions: deviceState.versions,
  // No uuid, ip, or name - heartbeat shouldn't change metadata!
};
```

---

## What Was Fixed ✅

### 1. Correct Endpoint
```javascript
// Now uses the correct heartbeat endpoint
const result = await makeRequest('PATCH', `/api/devices/${deviceId}/heartbeat`, body);
```

### 2. Removed UUID from Heartbeat
```javascript
// Simplified heartbeat body
const body = {
  playback_state: deviceState.playback_state || 'playing',
  versions: deviceState.versions,
  // No uuid, ip, or name fields
};
```

### 3. Pre-fetch Device Data (for future use)
```javascript
// Fetch device UUIDs from API at startup
async function fetchDevices() {
  const result = await makeRequest('GET', '/api/devices');
  result.data.forEach(device => {
    if (device.name && device.name.startsWith('LT Device')) {
      deviceUUIDs.set(device.id, device.uuid);
    }
  });
}
```

---

## Why This Matters

The original bugs would have caused:

1. **404 Errors**: Wrong endpoint would return "Not Found"
2. **Database Errors**: Invalid UUID format would crash every heartbeat
3. **Performance Issues**: Triggering metadata updates on every heartbeat would:
   - Write 199 devices × 360 heartbeats/hour = **71,640 unnecessary DB writes**
   - Completely negate the batch update optimization
   - Prevent testing the actual Redis caching

---

## Verification

The test now correctly:
- ✅ Uses `PATCH /api/devices/:id/heartbeat` endpoint
- ✅ Sends only `playback_state` and `versions` in body
- ✅ Does NOT trigger metadata updates
- ✅ Tests the actual Redis caching optimization
- ✅ Tests the batch ping update optimization
- ✅ Respects the actual API contract from backend/src/devices.ts

---

## How to Run

```bash
# Terminal 1: Monitor system
./monitor.sh monitor 10

# Terminal 2: Run load test
node load-test.js

# Or use quick start:
./start-load-test.sh
```

---

## Expected Results (Now Correct)

- **Success rate**: 100% (was getting 0% due to wrong endpoint)
- **Cache hit rate**: >95% (now actually tests caching)
- **Avg latency**: <5ms for cache hits, <20ms for misses
- **Database writes**: ~12/min (batch updates), not 71,640/hour
- **No errors**: All heartbeats succeed

---

## Lessons Learned

1. **Always check the actual backend code**, not outdated API.md
2. **Understand data types**: PostgreSQL UUID is not a string
3. **Read the full API contract**: What fields are optional vs required
4. **Test incrementally**: Start with 1 device before scaling to 199

Thank you for catching this! The test would have been completely broken without your review. 🙏
