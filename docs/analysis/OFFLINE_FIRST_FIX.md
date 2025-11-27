# GeekDS Android App - Offline-First Fix Strategy

## 🎯 **Design Philosophy**

**The app MUST work completely offline when the server is unreachable.**

- ✅ Server offline → App continues working normally with cached data
- ✅ Server comes back → App reconnects gracefully and syncs
- ✅ No crashes, no infinite retries, no system reboots
- ✅ **Application-side fixes ONLY** (don't touch Fuyao service)

---

## 📊 **Root Cause Analysis Summary**

### Timeline from Log Analysis:
```
11:02:33  → Server goes offline (DNS failure)
11:02:52  → First connection failure
          → App pauses heartbeats, starts health probe (good!)
11:03:54  → PROBLEM: External watchdog kills app (every ~20s)
          → System auto-restarts app
          → New instance fails immediately
          → Crash loop begins
11:11:36  → After 7 minutes: System reboot triggered
11:11:37  → HDMI service dies during emergency reboot
Result    → User wakes up to "HDMI not working"
```

### Why HDMI Failed:
The HDMI itself isn't broken - it's a **cascade effect**:
```
App crash loop (every 20s)
    ↓
Fuyao watchdog detects repeated failures
    ↓
Fuyao triggers emergency SYSTEM REBOOT
    ↓
HDMI service dies during reboot
    ↓
Display shows "No Signal"
```

**Fix the app crash loop → No reboot → HDMI stays alive!**

---

## 🔧 **The Fixes (Application-Side Only)**

### **Fix #1: Reduce OkHttp Timeouts & Disable Auto-Retry**

**Problem**: 30-60s timeouts mean each failed attempt wastes a full minute.

**Location**: `MainActivity.kt` lines 73-79

**Current Code**:
```kotlin
private val client = OkHttpClient.Builder()
    .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
    .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
    .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)  // Auto-retry makes things worse!
    .build()
```

**Fixed Code**:
```kotlin
private val httpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)      // Was 30s → Now 10s
    .readTimeout(15, TimeUnit.SECONDS)         // Was 60s → Now 15s
    .writeTimeout(10, TimeUnit.SECONDS)        // Was 30s → Now 10s
    .retryOnConnectionFailure(false)           // Disable auto-retry! We control retries.
    .build()
```

**Impact**: Fast failure detection (10s instead of 30-60s).

---

### **Fix #2: Circuit Breaker with Offline Mode**

**Problem**: Heartbeat runs indefinitely with NO failure limit. App cannot survive server offline.

**Goal**: After consecutive failures, enter **"Offline Mode"** where:
- App works normally with cached schedules
- Health probe runs at **LOW frequency** (5 minutes instead of 10 seconds)
- When server returns → gracefully resume normal operation

**Location**: `MainActivity.kt` lines 644-744

**Current Behavior**:
```
Heartbeat fails → Pauses heartbeats → Starts health probe (10s interval)
Health probe fails → Keeps trying every 10s FOREVER
After ~1 minute → External watchdog kills app
System restarts app → Immediate failure → Repeat
```

**New Behavior**:
```
Heartbeat fails 12 times (4 minutes) → Enter Offline Mode
Offline Mode:
  - App continues working with cached data
  - Health probe every 5 MINUTES (not 10 seconds!)
  - Low resource usage, no watchdog triggers
Server returns → Detect in 5-min health check → Resume heartbeat → Sync data
```

**Implementation**:

```kotlin
// Add these class properties
private var consecutiveFailures = 0
private val MAX_CONSECUTIVE_FAILURES = 12  // 12 × 20s = 4 minutes
private var isOfflineMode = false
private val OFFLINE_HEALTH_CHECK_INTERVAL = 5 * 60 * 1000L  // 5 minutes

private fun startHeartbeat() {
    Log.i(TAG, "Starting unified 20s heartbeat loop (pause-on-failure mode)")
    heartbeatJob?.cancel()
    consecutiveFailures = 0
    isOfflineMode = false
    heartbeatsPaused = false
    
    heartbeatJob = lifecycleScope.launch {
        while (isActive && !heartbeatsPaused) {
            delay(heartbeatInterval)
            
            // Check if we should enter offline mode
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                Log.w(TAG, "⚠️ Entering OFFLINE MODE after $consecutiveFailures consecutive failures")
                Log.w(TAG, "📴 App will continue working with cached data.")
                Log.w(TAG, "🔍 Server health check will run every 5 minutes.")
                enterOfflineMode()
                break
            }
            
            sendUnifiedHeartbeat()
        }
    }
}

private fun enterOfflineMode() {
    isOfflineMode = true
    heartbeatsPaused = true
    heartbeatJob?.cancel()
    
    // KEEP wake lock in offline mode for digital signage reliability
    // The device must stay awake to display content and check server status
    if (wakeLock?.isHeld == false) {
        wakeLock?.acquire()
        Log.i(TAG, "Wake lock ensured for offline mode")
    }
    
    // Start LOW-FREQUENCY health probe (5 minutes)
    heartbeatJob = lifecycleScope.launch {
        while (isActive && isOfflineMode) {
            delay(OFFLINE_HEALTH_CHECK_INTERVAL)
            
            Log.d(TAG, "🔍 [Offline Mode] Checking if server is back online...")
            
            if (checkServerHealth()) {
                Log.i(TAG, "✅ SERVER IS BACK ONLINE! Resuming normal operations.")
                exitOfflineMode()
                break
            } else {
                Log.d(TAG, "📴 [Offline Mode] Server still offline. Next check in 5 minutes.")
                Log.d(TAG, "   App continues working with cached data (${cachedSchedules.size} schedules)")
            }
        }
    }
}

private fun exitOfflineMode() {
    Log.i(TAG, "🔄 Exiting offline mode, resuming normal heartbeat")
    isOfflineMode = false
    heartbeatsPaused = false
    consecutiveFailures = 0
    
    // Wake lock already held, just ensure it's still active
    if (wakeLock?.isHeld == false) {
        wakeLock?.acquire()
        Log.i(TAG, "Re-acquiring wake lock")
    }
    
    // Resume normal heartbeat
    startHeartbeat()
    
    // Trigger immediate sync to get latest data
    lifecycleScope.launch {
        Log.i(TAG, "🔄 Syncing data after reconnection...")
        syncSchedules()
        syncPlaylists()
    }
}

private suspend fun checkServerHealth(): Boolean {
    return try {
        val response = withContext(Dispatchers.IO) {
            httpClient.newCall(
                Request.Builder()
                    .url("$cmsUrl/api/test")
                    .get()
                    .build()
            ).execute()
        }
        response.isSuccessful
    } catch (e: Exception) {
        Log.d(TAG, "Health check failed: ${e.message}")
        false
    }
}

private suspend fun sendUnifiedHeartbeat() {
    try {
        // ... existing heartbeat code ...
        
        // ON SUCCESS:
        consecutiveFailures = 0
        lastSuccessfulConnection = System.currentTimeMillis()
        
    } catch (e: Exception) {
        consecutiveFailures++
        val timeSinceLastSuccess = (System.currentTimeMillis() - lastSuccessfulConnection) / 1000
        
        Log.e(TAG, "Unified heartbeat failure: ${e.message}")
        Log.e(TAG, "Connection error in heartbeat (failure #$consecutiveFailures): ${e.javaClass.simpleName}: ${e.message}")
        Log.e(TAG, "Time since last successful connection: ${timeSinceLastSuccess}s")
        
        if (consecutiveFailures == 1) {
            Log.d(TAG, "[ERROR] heartbeat failed (attempt $consecutiveFailures)")
        }
    }
}
```

---

### **Fix #3: Exponential Backoff for Health Probe (Already Good!)**

**Current Implementation**: Your existing health probe already uses exponential backoff!

**Location**: `MainActivity.kt` lines 447-471

```kotlin
private fun startHealthProbe() {
    var attempt = 0
    val baseDelay = 10_000L  // 10 seconds
    val maxDelay = 300_000L  // 5 minutes
    
    healthProbeJob = lifecycleScope.launch {
        while (isActive && heartbeatsPaused) {
            attempt++
            val delay = min(baseDelay * (1 shl (attempt - 1)), maxDelay)
            // 10s → 20s → 40s → 80s → 160s → 300s (5min max)
            
            delay(delay)
            
            if (checkServerConnection()) {
                // Resume heartbeat
                heartbeatsPaused = false
                startHeartbeat()
                break
            }
        }
    }
}
```

**This is good!** But with Fix #2, we replace this with the 5-minute offline mode check, which is even better because:
- No exponential complexity needed
- Constant 5-minute interval is simple and predictable
- Lower resource usage

---

### **Fix #4: Simplified Wake Lock Strategy**

**Problem**: Wake lock management was overly complex.

**For Digital Signage**: Keep it simple - **ALWAYS hold the wake lock** when app is running.

**Location**: `MainActivity.kt` lines 305-316

**Current Code**:
```kotlin
wakeLock = powerManager.newWakeLock(
    PowerManager.PARTIAL_WAKE_LOCK,
    "GeekDS::PlaybackWakeLock"
)
wakeLock?.acquire()  // Held forever
Log.i(TAG, "Wake lock acquired")
```

**Recommended Approach**: **Keep it as-is!** 

For a digital signage device, you WANT the wake lock held continuously:
- ✅ Ensures display stays active
- ✅ Guarantees background tasks execute (health checks, schedule evaluation)
- ✅ Prevents device from entering deep sleep
- ✅ Critical for 24/7 operation

**Optional Enhancement** (only if you want power saving during literal standby):
```kotlin
private fun acquireWakeLockIfNeeded() {
    // For digital signage: ALWAYS hold wake lock
    if (wakeLock?.isHeld == false) {
        wakeLock?.acquire()
        Log.i(TAG, "Wake lock acquired")
    }
}

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "GeekDS::DisplayWakeLock"
    )
    acquireWakeLockIfNeeded()  // Acquire on startup
}

override fun onDestroy() {
    // Only release when app actually closes
    if (wakeLock?.isHeld == true) {
        wakeLock?.release()
        Log.i(TAG, "Wake lock released on destroy")
    }
    super.onDestroy()
}
```

**Bottom Line**: For digital signage, **keep wake lock held at all times**. Don't release it in offline mode!

---

### **Fix #5: Network State Monitoring (Already Implemented!)**

**Status**: ✅ Already implemented correctly!

**Location**: `MainActivity.kt` lines 327-361

Your existing code is perfect:
```kotlin
private fun setupNetworkMonitoring() {
    val networkRequest = NetworkRequest.Builder()
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()
    
    networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            isNetworkAvailable = true
            Log.i(TAG, "*** NETWORK AVAILABLE ***")
            // Trigger sync when network returns
        }
        
        override fun onLost(network: Network) {
            isNetworkAvailable = false
            Log.w(TAG, "*** NETWORK LOST ***")
        }
    }
    
    connectivityManager?.registerNetworkCallback(networkRequest, networkCallback!!)
}
```

**Enhancement**: Integrate with offline mode:

```kotlin
override fun onAvailable(network: Network) {
    isNetworkAvailable = true
    Log.i(TAG, "*** NETWORK AVAILABLE ***")
    
    // If in offline mode, trigger immediate health check
    if (isOfflineMode) {
        lifecycleScope.launch {
            Log.i(TAG, "Network restored during offline mode - checking server...")
            if (checkServerHealth()) {
                exitOfflineMode()
            }
        }
    }
}
```

---

## 🚀 **Implementation Order**

### Phase 1: Quick Wins (Do First!)
1. ✅ **Fix #1**: Reduce OkHttp timeouts (10s instead of 30-60s)
2. ✅ **Fix #2**: Add offline mode circuit breaker
3. ✅ **Fix #4**: Make wake lock conditional

### Phase 2: Testing
1. Test with server offline for 10+ minutes
2. Verify app stays stable (no crashes)
3. Verify no system reboots
4. Bring server back online
5. Verify app reconnects within 5 minutes
6. Verify data syncs correctly

### Phase 3: Validation
1. Leave device overnight with server offline
2. Check in morning - app should be running fine
3. HDMI should be working
4. No system reboots in logs

---

## 📝 **Expected Behavior After Fixes**

### Scenario 1: Server Goes Offline
```
00:00 - Server goes offline
00:01 - First heartbeat failure
00:04 - 12th consecutive failure → Enter Offline Mode
00:04 - App shows cached content, works normally
00:09 - First 5-minute health check (server still offline)
00:14 - Second 5-minute health check (server still offline)
... continues indefinitely ...
```

**Result**: ✅ App stable, no crashes, no reboots

### Scenario 2: Server Returns
```
00:00 - App in Offline Mode (server offline for 2 hours)
00:05 - Regular 5-minute health check
00:05 - Health check succeeds! Server is back!
00:05 - Exit Offline Mode
00:05 - Resume normal heartbeat (20s interval)
00:05 - Sync schedules and playlists
00:06 - App fully caught up with server
```

**Result**: ✅ Graceful reconnection, data synced

### Scenario 3: Overnight with Server Offline
```
22:00 - User goes to sleep, server offline
22:04 - App enters Offline Mode
22:00-08:00 - Health checks every 5 minutes (96 checks)
08:00 - User wakes up
```

**Result**: 
- ✅ App running normally
- ✅ HDMI working
- ✅ No system reboots
- ✅ Display showing cached content

---

## 🎯 **Success Metrics**

After implementing these fixes, you should see:

1. ✅ **No app crashes** when server offline
2. ✅ **No system reboots** from Fuyao watchdog
3. ✅ **HDMI stays alive** during overnight operation
4. ✅ **Graceful reconnection** when server returns
5. ✅ **Low CPU/battery usage** in offline mode (5-min checks)
6. ✅ **App works independently** of server state

---

## 🔍 **Testing Checklist**

### Test 1: Server Offline (30 minutes)
- [ ] Stop server
- [ ] Wait 5 minutes - verify app enters offline mode
- [ ] Check logs - should see "Entering OFFLINE MODE"
- [ ] Wait 30 minutes - verify app still running
- [ ] Check logs - should see health checks every 5 minutes
- [ ] Verify no crashes, no force-stops
- [ ] Start server
- [ ] Wait up to 5 minutes - verify app reconnects
- [ ] Check logs - should see "SERVER IS BACK ONLINE"

### Test 2: Overnight Stability
- [ ] Stop server before sleep
- [ ] Leave app running overnight (8+ hours)
- [ ] Wake up and check:
  - [ ] App still running (no crashes)
  - [ ] HDMI working (no "No Signal")
  - [ ] Device not rebooted (check uptime)
  - [ ] Logs show health checks every 5 minutes
- [ ] Start server
- [ ] Verify app reconnects and syncs

### Test 3: Server Intermittent
- [ ] Server online → offline → online (multiple cycles)
- [ ] Verify app handles transitions gracefully
- [ ] No crashes during transitions

---

## 💡 **Why This Works**

1. **Fast Failure Detection**: 10s timeout means we know quickly if server is gone
2. **Circuit Breaker**: After 4 minutes of failures, we accept "server is offline"
3. **Low-Frequency Checks**: 5-minute health checks don't strain system resources
4. **Watchdog Won't Trigger**: App responsive, not stuck in tight retry loop
5. **Graceful Recovery**: When server returns, we detect it and resume normally
6. **Resource Efficient**: Wake lock released, minimal CPU usage in offline mode

The key insight: **The app should be self-sufficient with cached data. Server is optional.**

---

## 📚 **Additional Notes**

### Why NOT Touch Fuyao?
- Fuyao is system-level watchdog (PID 640, system_server)
- Modifying it requires system partition access
- Our app should work WITH Fuyao, not against it
- If app is stable, Fuyao won't interfere

### Why 5-Minute Interval?
- Long enough to not waste resources
- Short enough to reconnect reasonably quickly
- Won't trigger watchdog timeouts
- Balances responsiveness vs efficiency

### Why Circuit Breaker at 12 Failures?
- 12 failures × 20s = 4 minutes
- Enough time to detect real outage vs temporary glitch
- Not too long (user doesn't wait forever)
- Not too short (avoids false positives)

---

**Ready to implement? Start with Fix #1 and #2 - they'll solve 90% of the problem!** 🚀
