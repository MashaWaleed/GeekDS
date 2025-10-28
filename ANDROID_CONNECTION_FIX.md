# Android App Connection Handling Fixes

## Problem
When GeekDS server has DNS failures (or is offline), the Android app:
- Retries connections indefinitely with 30-second timeouts
- Holds wake lock continuously
- Exhausts system resources over hours
- Can cause HDMI subsystem crashes

## Root Cause
Server systemd service failed to start due to DNS resolver failure:
```
dial tcp: lookup registry-1.docker.io on 127.0.0.53:53: server misbehaving
```

This left the server offline, but the Android app doesn't gracefully handle long-term server unavailability.

## Required Fixes

### 1. Add Maximum Connection Failure Limit
```kotlin
companion object {
    private const val MAX_CONNECTION_FAILURES_BEFORE_BACKOFF = 10
    private const val MAX_BACKOFF_DELAY = 5 * 60 * 1000L // 5 minutes
    private const val GIVE_UP_AFTER_FAILURES = 100 // Stop trying after 100 failures
}

private fun sendUnifiedHeartbeat() {
    if (connectionFailureCount >= GIVE_UP_AFTER_FAILURES) {
        Log.e("GeekDS", "Giving up after $connectionFailureCount failures. Manual intervention required.")
        pauseHeartbeatsIndefinitely()
        return
    }
    // ... existing code ...
}

private fun pauseHeartbeatsIndefinitely() {
    heartbeatsPaused = true
    healthProbeJob?.cancel()
    wakeLock?.release() // Release wake lock to save power
    
    // Show error on screen
    runOnUiThread {
        showPersistentErrorDialog(
            "Server Unreachable",
            "Cannot connect to CMS server after multiple attempts.\n\n" +
            "Please check:\n" +
            "1. Server is running\n" +
            "2. Network connection is working\n" +
            "3. Server URL is correct: $cmsUrl\n\n" +
            "Device will retry connection on next reboot or network change."
        )
    }
}
```

### 2. Reduce Connection Timeouts for Faster Failure Detection
```kotlin
private val client = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)      // Reduced from 30s
    .readTimeout(20, TimeUnit.SECONDS)         // Reduced from 60s
    .writeTimeout(15, TimeUnit.SECONDS)        // Reduced from 30s
    .callTimeout(30, TimeUnit.SECONDS)         // NEW: Total call timeout
    .retryOnConnectionFailure(false)           // Disable auto-retry, handle manually
    .build()
```

### 3. Implement Exponential Backoff with Cap
```kotlin
private fun calculateHeartbeatDelay(): Long {
    if (connectionFailureCount == 0) return 20_000L // Normal: 20s
    
    // Exponential backoff: 20s, 40s, 80s, 160s, 300s (max 5 min)
    val baseDelay = 20_000L
    val exponentialDelay = baseDelay * (1L shl minOf(connectionFailureCount - 1, 4))
    return minOf(exponentialDelay, MAX_BACKOFF_DELAY)
}

// In startBackgroundTasks():
scope.launch {
    while (isActive) {
        if (!heartbeatsPaused && connectionFailureCount < GIVE_UP_AFTER_FAILURES) {
            if (isNetworkConnected()) {
                sendUnifiedHeartbeat()
            }
        }
        
        val delay = calculateHeartbeatDelay()
        Log.d("GeekDS", "Next heartbeat in ${delay/1000}s (failures: $connectionFailureCount)")
        delay(delay)
    }
}
```

### 4. Release Wake Lock on Extended Failures
```kotlin
private fun handleConnectionError(operation: String, error: Throwable) {
    connectionFailureCount++
    
    // Cap at reasonable limit
    if (connectionFailureCount > 100) connectionFailureCount = 100
    
    Log.e("GeekDS", "Connection error #$connectionFailureCount in $operation: $error")
    
    // Release wake lock after extended failures to save battery
    if (connectionFailureCount >= 20) {
        cleanupWakeLock()
        Log.w("GeekDS", "Released wake lock due to extended connection failures")
    }
    
    // ... rest of existing code ...
}
```

### 5. Fix Health Probe to Respect Limits
```kotlin
private fun pauseHeartbeats() {
    if (heartbeatsPaused) return
    heartbeatsPaused = true
    
    Log.w("GeekDS", "Heartbeats paused. Starting limited health probe.")
    
    healthProbeJob?.cancel()
    healthProbeJob = scope.launch(Dispatchers.IO) {
        var probeAttempts = 0
        val maxProbeAttempts = 20 // Limit probe attempts
        
        while (isActive && heartbeatsPaused && probeAttempts < maxProbeAttempts) {
            probeAttempts++
            var delayMs = 30_000L // 30 seconds between probes
            
            try {
                if (!isNetworkConnected()) {
                    delayMs = 10_000L
                } else {
                    val req = Request.Builder()
                        .url("$cmsUrl/api/health")
                        .get()
                        .build()
                        
                    withTimeout(10_000L) { // 10 second timeout for health check
                        client.newCall(req).execute().use { resp ->
                            if (resp.isSuccessful) {
                                Log.i("GeekDS", "Health probe success – resuming heartbeats")
                                heartbeatsPaused = false
                                connectionFailureCount = 0
                                lastSuccessfulConnection = System.currentTimeMillis()
                                return@launch
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.d("GeekDS", "Health probe attempt $probeAttempts/$maxProbeAttempts failed")
            }
            
            delay(delayMs)
        }
        
        // Give up after max attempts
        if (probeAttempts >= maxProbeAttempts) {
            Log.e("GeekDS", "Health probe gave up after $maxProbeAttempts attempts")
            pauseHeartbeatsIndefinitely()
        }
    }
}
```

### 6. Add DNS Resolution Check
```kotlin
private fun isServerReachable(): Boolean {
    return try {
        // Try to resolve hostname first (catches DNS failures early)
        val url = java.net.URL(cmsUrl)
        val host = url.host
        
        // Quick DNS check with timeout
        withTimeoutOrNull(5000L) {
            java.net.InetAddress.getByName(host)
        } != null
    } catch (e: Exception) {
        Log.e("GeekDS", "DNS resolution failed for $cmsUrl: ${e.message}")
        false
    }
}

// Use before making HTTP requests:
private fun sendUnifiedHeartbeat() {
    if (!isServerReachable()) {
        handleConnectionError("heartbeat", IOException("DNS resolution failed"))
        return
    }
    // ... rest of code ...
}
```

## Server-Side Fix

Fix the DNS resolution issue on the server:

```bash
# Check DNS resolver
sudo systemd-resolve --status

# Restart systemd-resolved if needed
sudo systemctl restart systemd-resolved

# Test DNS resolution
nslookup registry-1.docker.io

# Alternative: Use Google DNS
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Or configure Docker to use specific DNS
# Add to /etc/docker/daemon.json:
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
sudo systemctl restart docker
```

## Testing

1. **Test with server offline**:
   ```bash
   sudo systemctl stop geekds
   ```
   - App should back off gracefully
   - Wake lock should be released after 20 failures
   - App should stop trying after 100 failures

2. **Test with DNS failure**:
   ```bash
   # On Android device, set wrong DNS in WiFi settings
   ```
   - App should detect DNS failure quickly (5s timeout)
   - Should not hold wake lock indefinitely

3. **Test recovery**:
   ```bash
   sudo systemctl start geekds
   ```
   - App should detect server is back
   - Should resume normal operation

## Impact
- **Battery**: Wake lock released after extended failures
- **Resources**: Connection attempts capped at reasonable limits
- **Stability**: No more resource exhaustion causing system crashes
- **User Experience**: Clear error message instead of silent failure
