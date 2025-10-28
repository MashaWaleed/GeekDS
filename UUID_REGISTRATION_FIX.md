# UUID-Based Registration Fix

## 🎯 **Problem Statement**

### Issue #1: IP-Based Registration is Unreliable
**Problem:**
- DHCP routers can reassign IP addresses
- Old devices in database may have stale/unused IPs
- New device might get an IP that matches old device in DB
- `/check-registration/:ip` could match wrong device

**Example Scenario:**
```
Day 1: Device A gets IP 192.168.1.100 → Registered in DB
Day 2: Device A is removed/replaced
Day 3: New Device B gets IP 192.168.1.100 (DHCP reuse)
Day 3: Device B checks registration → Matches old Device A! ❌
```

### Issue #2: Random UUID is Not Durable
**Problem:**
- `UUID.randomUUID()` generates new random UUID each time
- If app data is cleared → UUID changes → Device appears as "new"
- If device is factory reset → UUID changes → Loses identity
- Not tied to hardware → Can't survive reinstalls reliably

---

## ✅ **Solution: Hardware-Based Durable UUID**

### **1. Android Hardware ID (ANDROID_ID)**

Android provides `Settings.Secure.ANDROID_ID` which is:
- ✅ **Unique** per device + app signing key combination
- ✅ **Durable** - Survives app reinstalls (same signing key)
- ✅ **Consistent** - Same UUID for device's lifetime
- ✅ **No permissions** - No special permissions required
- ✅ **Hardware-tied** - Based on device hardware

**Important Notes:**
- Survives app uninstall/reinstall (if same signing certificate)
- Resets on factory reset (this is acceptable - device is "new")
- Different apps get different IDs (unless same developer)

### **2. UUID Generation Algorithm**

```kotlin
private fun generateHardwareBasedUuid(): String {
    // 1. Get Android ID (unique to device + app)
    val androidId = Settings.Secure.getString(
        contentResolver,
        Settings.Secure.ANDROID_ID
    ) ?: "fallback-${System.currentTimeMillis()}"

    // 2. Create deterministic UUID using UUID v5 (name-based with SHA-1)
    val namespace = UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
    val uuid = UUID.nameUUIDFromBytes((namespace.toString() + androidId).toByteArray())
    
    return uuid.toString()
}
```

**Why Deterministic?**
- Same Android ID always produces same UUID
- Ensures consistency across app reinstalls
- Based on standard UUID v5 algorithm

---

## 🔄 **Registration Flow Changes**

### **Old Flow (IP-based - UNRELIABLE):**
```
1. Device generates random UUID
2. Device sends IP to server for registration request
3. Admin registers device with code
4. Device polls /check-registration/:ip ❌ (IP can match wrong device!)
5. Device receives deviceId and starts
```

### **New Flow (UUID-based - RELIABLE):**
```
1. Device generates HARDWARE-BASED UUID (deterministic)
2. Device sends UUID + IP to server for registration request
3. Admin registers device with code → Server stores UUID
4. Device polls /check-registration/by-uuid/:uuid ✅ (UUID is unique!)
5. Device receives deviceId and starts
```

---

## 📝 **Implementation Changes**

### **Android App Changes:**

#### **1. Hardware-Based UUID Generation** ✅
```kotlin
// MainActivity.kt - Line ~250
deviceUuid = loadDeviceUuid()
if (deviceUuid == null) {
    deviceUuid = generateHardwareBasedUuid()  // ← NEW: Hardware-based
    saveDeviceUuid(deviceUuid!!)
}

private fun generateHardwareBasedUuid(): String {
    val androidId = Settings.Secure.getString(
        contentResolver,
        Settings.Secure.ANDROID_ID
    ) ?: "fallback-${System.currentTimeMillis()}"
    
    // Deterministic UUID from Android ID
    val namespace = UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
    return UUID.nameUUIDFromBytes((namespace.toString() + androidId).toByteArray()).toString()
}
```

#### **2. Send UUID in Registration Request** ✅
```kotlin
// MainActivity.kt - requestRegistrationCode()
val json = JSONObject().apply {
    put("ip", currentIp)
    put("uuid", currentUuid)  // ← NEW: Include UUID
}
```

#### **3. UUID-Only Registration Check** ✅
```kotlin
// MainActivity.kt - Registration polling
if (uuid != null) {
    checkRegistrationByUuid(uuid, this)  // ← NEW: UUID only, no IP fallback
} else {
    // Regenerate UUID if missing
    deviceUuid = generateHardwareBasedUuid()
    saveDeviceUuid(deviceUuid!!)
}
```

#### **4. Removed IP-Based Check** ✅
```kotlin
// DEPRECATED: checkRegistrationStatus(ip) - Commented out
// Use checkRegistrationByUuid() instead
```

---

### **Backend Changes:**

#### **1. Store UUID in Pending Registrations** ✅
```typescript
// devices.ts
const pendingRegistrations = new Map<string, {
  ip: string;
  uuid: string;  // ← NEW: Store UUID
  timestamp: number;
}>();
```

#### **2. Accept UUID in Registration Request** ✅
```typescript
// POST /api/devices/register-request
router.post('/register-request', async (req, res) => {
  const { ip, uuid } = req.body;  // ← NEW: Require UUID
  
  if (!uuid) {
    return res.status(400).json({ error: 'UUID required' });
  }
  
  pendingRegistrations.set(code, { ip, uuid, timestamp: Date.now() });
  console.log(`Code ${code} for UUID: ${uuid.substring(0, 8)}...`);
});
```

#### **3. Save UUID When Registering Device** ✅
```typescript
// POST /api/devices/register-device
const result = await pool.query(
  'INSERT INTO devices (name, ip, uuid, status, last_ping) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
  [name.trim(), pendingReg.ip, pendingReg.uuid, 'online']  // ← NEW: Save UUID
);
```

#### **4. UUID-Based Registration Check Already Exists** ✅
```typescript
// GET /api/devices/check-registration/by-uuid/:uuid
// Already implemented - no changes needed
router.get('/check-registration/by-uuid/:uuid', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM devices WHERE uuid = $1 LIMIT 1',
    [uuid]
  );
  // ...
});
```

---

## 🔒 **Security & Durability Benefits**

### **Before (Random UUID):**
- ❌ Changes on app reinstall
- ❌ Changes on data clear
- ❌ No hardware tie
- ❌ IP conflicts possible
- ❌ Device loses identity easily

### **After (Hardware UUID):**
- ✅ Consistent across reinstalls
- ✅ Survives app data clear
- ✅ Tied to device hardware
- ✅ No IP-based conflicts
- ✅ Durable device identity

---

## 🧪 **Testing Scenarios**

### **Test 1: App Reinstall**
```
1. Install app, register device (UUID: abc123...)
2. Uninstall app
3. Reinstall app
Expected: Same UUID (abc123...) → Device auto-reconnects ✅
```

### **Test 2: IP Reassignment**
```
1. Device A registered with IP 192.168.1.100, UUID: aaa111
2. Remove Device A from network
3. Device B gets IP 192.168.1.100, has UUID: bbb222
4. Device B tries to register
Expected: No conflict! UUIDs are different ✅
```

### **Test 3: Factory Reset**
```
1. Device registered with UUID: abc123...
2. Factory reset device
3. Reinstall app
Expected: NEW UUID generated → Device needs re-registration ✅
(This is correct - factory reset = new device identity)
```

### **Test 4: Network Change**
```
1. Device registered with IP 192.168.1.100
2. Network changes, device gets IP 192.168.1.200
3. Device checks registration by UUID
Expected: Still registered! IP doesn't matter ✅
```

---

## 📊 **Database Schema**

Ensure `devices` table has `uuid` column:

```sql
-- Migration (if needed)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS uuid VARCHAR(255) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_devices_uuid ON devices(uuid);
```

**Column Properties:**
- `uuid`: VARCHAR(255), UNIQUE
- Used as primary identifier for device registration
- IP is still stored but not used for identification

---

## 🚀 **Deployment Checklist**

### **Prerequisites:**
- [ ] Database has `uuid` column in `devices` table
- [ ] Index on `uuid` column for performance

### **Backend Deployment:**
- [ ] Deploy updated `devices.ts` with UUID support
- [ ] Test `/register-request` accepts UUID
- [ ] Test `/register-device` saves UUID
- [ ] Test `/check-registration/by-uuid/:uuid` works

### **Android Deployment:**
- [ ] Build APK with hardware UUID generation
- [ ] Test UUID generation on first install
- [ ] Test UUID persistence after app restart
- [ ] Test UUID persistence after reinstall
- [ ] Test registration flow with UUID

### **Migration (Existing Devices):**
For devices already registered without UUID:
```typescript
// One-time migration endpoint (optional)
router.post('/devices/:id/assign-uuid', async (req, res) => {
  const { id } = req.params;
  const { uuid } = req.body;
  
  await pool.query(
    'UPDATE devices SET uuid = $1 WHERE id = $2',
    [uuid, id]
  );
  
  res.json({ success: true });
});
```

---

## 🎯 **Summary**

### **Key Changes:**
1. ✅ **UUID is now hardware-based** (Android ID + deterministic generation)
2. ✅ **Registration uses UUID only** (no IP-based fallback)
3. ✅ **Server stores UUID** during registration
4. ✅ **Device checks by UUID** for registration status

### **Benefits:**
- 🔒 **Reliable** - No IP conflicts
- 🔄 **Durable** - Survives app reinstalls
- 🎯 **Accurate** - Hardware-tied identification
- 🚀 **Future-proof** - Works across network changes

### **Compatibility:**
- ✅ New devices: Use hardware UUID from start
- ✅ Existing devices: Will get UUID on next heartbeat (server stores it)
- ✅ Factory reset: Device gets new UUID (needs re-registration - correct behavior)

---

**Status: ✅ IMPLEMENTED**
- Android: Hardware-based UUID generation
- Android: UUID-only registration check
- Backend: UUID storage and validation
- Backend: UUID-based device lookup

**Next Steps:**
1. Test registration flow end-to-end
2. Verify UUID persistence across reinstalls
3. Monitor for any IP-based conflicts (should be zero)
4. Update admin dashboard to show UUID (for debugging)
