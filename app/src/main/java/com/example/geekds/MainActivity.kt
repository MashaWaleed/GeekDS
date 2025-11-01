package com.example.geekds

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.widget.ImageView
import android.widget.RelativeLayout
import android.graphics.Color
import android.view.ViewGroup
import android.widget.LinearLayout
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.TextView
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.MediaItem
import androidx.media3.ui.PlayerView
import java.net.NetworkInterface
import java.util.*
import com.google.gson.Gson
//import android.content.Context
import kotlinx.coroutines.*
import kotlin.concurrent.fixedRateTimer
import java.time.ZoneId
// NEW: Screenshot imports
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.ByteArrayOutputStream
import kotlin.math.min
import android.view.View
import android.media.MediaMetadataRetriever
import android.view.TextureView
import android.view.SurfaceView
import kotlinx.coroutines.Dispatchers
import java.time.ZonedDateTime
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.text.SimpleDateFormat
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.PowerManager
import android.provider.Settings
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private var deviceName: String = "ARC-A-GR-18" // Default fallback
    private var cmsUrl: String = "http://192.168.1.10:5000" // Default fallback
    private var deviceId: Int? = null
    private var deviceUuid: String? = null

    // Enhanced OkHttpClient with longer timeouts and retry
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var statusView: TextView

    // Add these properties to MainActivity class
    private var isPlaylistActive = false
    private var currentPlaylistId: Int? = null
    // Add these new properties for standby managementP
    private var standbyImageView: ImageView? = null
    private var rootContainer: ViewGroup? = null

    // Add these new properties for connection management
    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastSuccessfulConnection: Long = 0
    private var registrationCheckAttempts = 0 // For smarter registration polling
    private var registrationPollingRunnable: Runnable? = null // Polling task reference
    private var connectionFailureCount = 0
    private var isNetworkAvailable = false
    // Unified heartbeat versions & control
    // Use Long for version counters to avoid 32-bit overflow (epoch ms exceeds Int range)
    private var lastKnownScheduleVersion: Long = 0
    private var lastKnownPlaylistVersion: Long = 0
    private var heartbeatsPaused = false
    private var healthProbeJob: Job? = null

    // Add timing for log throttling
    private var lastScheduleLogTime = 0L
    private var lastPlaylistLogTime = 0L

    // Track last fetched ALL schedules version to avoid redundant fetches
    private var lastAllSchedulesVersion: Long = 0


    // State machine
    private enum class State { REGISTERING, IDLE, SYNCING, ERROR }

    // UUID-ONLY registration check (no IP fallback - IP is unreliable)
    private fun checkRegistrationByUuid(uuid: String, pollingRunnable: Runnable) {
        registrationCheckAttempts++

        val uuidReq = Request.Builder()
            .url("$cmsUrl/api/devices/check-registration/by-uuid/$uuid")
            .get()
            .build()

        client.newCall(uuidReq).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Network error - retry with exponential backoff
                if (state == State.REGISTERING) {
                    val delay = calculateRegistrationDelay()
                    Log.d("GeekDS", "[REGISTERING] UUID check failed (network error), retrying in ${delay}ms: ${e.message}")
                    handler.postDelayed(pollingRunnable, delay)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string()
                if (response.isSuccessful && body != null) {
                    try {
                        val json = JSONObject(body)
                        val registered = json.getBoolean("registered")
                        if (registered) {
                            val deviceJson = json.getJSONObject("device")
                            val newId = deviceJson.getInt("id")
                            val newName = deviceJson.getString("name")
                            runOnUiThread {
                                stopRegistrationPolling()
                                currentRegistrationDialog?.dismiss()
                                saveDeviceId(newId)
                                saveDeviceName(newName)
                                deviceId = newId
                                deviceName = newName
                                setState(State.IDLE, "Device registered (UUID: ${uuid.take(8)}...)")
                                startBackgroundTasks()
                            }
                            return
                        } else {
                            // Not registered yet - keep polling
                            if (state == State.REGISTERING) {
                                val delay = calculateRegistrationDelay()
                                Log.d("GeekDS", "[REGISTERING] Not registered yet (UUID: ${uuid.take(8)}...), retry in ${delay}ms")
                                handler.postDelayed(pollingRunnable, delay)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("GeekDS", "[REGISTERING] Error parsing UUID check response: ${e.message}")
                        if (state == State.REGISTERING) {
                            val delay = calculateRegistrationDelay()
                            handler.postDelayed(pollingRunnable, delay)
                        }
                    }
                } else {
                    // Server error or bad response
                    if (state == State.REGISTERING) {
                        val delay = calculateRegistrationDelay()
                        Log.d("GeekDS", "[REGISTERING] Server error (HTTP ${response.code}), retry in ${delay}ms")
                        handler.postDelayed(pollingRunnable, delay)
                    }
                }
            }
        })
    }

    private var state: State = State.REGISTERING

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var scheduleEnforcerJob: Job? = null

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var videoTextureView: TextureView? = null

    private var lastPlayedPlaylistId: Int? = null
    private var lastScheduleWindow: Pair<Long, Long>? = null
    private var lastScheduleTimestamp: String? = null
    private var lastPlaylistTimestamp: String? = null

    // Egypt timezone (GMT+3)
    private val egyptTimeZone = ZoneId.of("Africa/Cairo")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Load external configuration FIRST
        loadExternalConfig()?.let { config ->
            // Update device name if provided
            config.optString("device_name")?.let { name ->
                if (name.isNotEmpty()) {
                    deviceName = name
                    Log.i("GeekDS", "Loaded device name from config: $deviceName")
                }
            }

            // Update server URL if provided
            config.optString("server_mdns")?.let { url ->
                if (url.isNotEmpty()) {
                    // Ensure URL has proper scheme
                    cmsUrl = if (url.startsWith("http://") || url.startsWith("https://")) {
                        url
                    } else {
                        "http://$url"
                    }
                    Log.i("GeekDS", "Loaded server URL from config: $cmsUrl")
                }
            }
        } ?: run {
            Log.w("GeekDS", "No external config found, using defaults: name='$deviceName', url='$cmsUrl'")
        }

        // Validate the final URL
        try {
            val testUrl = "$cmsUrl/api/test"
            Log.i("GeekDS", "Final CMS URL configured: $cmsUrl")
            Log.d("GeekDS", "Test URL would be: $testUrl")
        } catch (e: Exception) {
            Log.e("GeekDS", "Invalid CMS URL configured: $cmsUrl", e)
            // Fallback to default
            cmsUrl = "http://192.168.1.212:5000"
            Log.w("GeekDS", "Using fallback URL: $cmsUrl")
        }
        // Create a root container that can hold both standby image and player
        rootContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
        }

        // Add status view to container (optional - you can remove this if you don't want it visible)
        statusView = TextView(this)
        statusView.text = "Starting..."
        statusView.setTextColor(Color.WHITE)
        statusView.textSize = 16f
        statusView.setPadding(20, 20, 20, 20)
        // rootContainer.addView(statusView) // Uncomment if you want status text visible

        setContentView(rootContainer)

        // Initialize with standby screen
        showStandby()
        // Setup network monitoring and wake lock
        setupNetworkMonitoring()
        setupWakeLock()

        deviceId = loadDeviceId()

        // Load device name from saved preferences if available
        loadDeviceName()?.let { savedName ->
            deviceName = savedName
            Log.i("GeekDS", "Loaded saved device name: '$deviceName'")
        }

        // Load or generate durable hardware-based UUID
        deviceUuid = loadDeviceUuid()
        if (deviceUuid == null) {
            // Generate UUID based on Android ID (hardware-tied, survives app reinstalls)
            deviceUuid = generateHardwareBasedUuid()
            saveDeviceUuid(deviceUuid!!)
            android.util.Log.i("GeekDS", "Generated new hardware-based UUID: ${deviceUuid}")
        } else {
            android.util.Log.i("GeekDS", "Loaded device UUID: ${deviceUuid}")
        }

        if (deviceId != null) {
            setState(State.IDLE, "Loaded device $deviceId (name: '$deviceName')")
            startBackgroundTasks()
        } else {
            setState(State.REGISTERING, "Registering device...")
            showRegistrationScreen() // Use proper registration flow
        }
    }

    override fun onDestroy() {
        super.onDestroy()

        // Stop registration polling
        stopRegistrationPolling()

        // Dismiss any dialogs
        currentRegistrationDialog?.dismiss()

        // Clean up player
        player?.release()
        player = null
        standbyImageView = null

        // Clean up coroutines
        scope.cancel()
        scheduleEnforcerJob?.cancel()

        // Clean up network monitoring and wake lock
        cleanupNetworkMonitoring()
        cleanupWakeLock()
    }

    private fun setupWakeLock() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "GeekDS::KeepAlive"
            ).apply {
                acquire(10*60*1000L /*10 minutes*/)
            }
            Log.i("GeekDS", "Wake lock acquired")
        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to acquire wake lock", e)
        }
    }

    private fun cleanupWakeLock() {
        try {
            wakeLock?.let {
                if (it.isHeld) {
                    it.release()
                    Log.i("GeekDS", "Wake lock released")
                }
            }
        } catch (e: Exception) {
            Log.e("GeekDS", "Error releasing wake lock", e)
        }
    }

    private fun setupNetworkMonitoring() {
        try {
            connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.i("GeekDS", "*** NETWORK AVAILABLE ***")
                    isNetworkAvailable = true
                    connectionFailureCount = 0
                    lastSuccessfulConnection = System.currentTimeMillis()

                    // Restart background tasks when network comes back
                    handler.postDelayed({
                        if (deviceId != null) {
                            Log.i("GeekDS", "Network restored - restarting sync")
                            syncScheduleAndMedia()
                        }
                    }, 2000) // Wait 2 seconds for network to stabilize
                }

                override fun onLost(network: Network) {
                    Log.w("GeekDS", "*** NETWORK LOST ***")
                    isNetworkAvailable = false
                    setState(State.ERROR, "Network connection lost")
                }

                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    val hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    val hasValidated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    Log.d("GeekDS", "Network capabilities - Internet: $hasInternet, Validated: $hasValidated")
                }
            }

            val networkRequest = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            connectivityManager?.registerNetworkCallback(networkRequest, networkCallback!!)

            // Check initial network state
            val activeNetwork = connectivityManager?.activeNetwork
            isNetworkAvailable = activeNetwork != null
            if (isNetworkAvailable) {
                lastSuccessfulConnection = System.currentTimeMillis()
            }

            Log.i("GeekDS", "Network monitoring setup complete. Initial state: $isNetworkAvailable")

        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to setup network monitoring", e)
        }
    }

    private fun cleanupNetworkMonitoring() {
        try {
            networkCallback?.let {
                connectivityManager?.unregisterNetworkCallback(it)
            }
        } catch (e: Exception) {
            Log.e("GeekDS", "Error cleaning up network monitoring", e)
        }
    }

    // Enhanced connection checking - LAN-only compatible
    private fun isNetworkConnected(): Boolean {
        return try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false

            // Only check for internet capability, not validation (allows LAN-only networks)
            networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (e: Exception) {
            Log.e("GeekDS", "Error checking network connection", e)
            false
        }
    }

    // Enhanced error handling with automatic recovery
    // Add this property to your MainActivity class
    private var lastRecoveryAttempt = 0L
    private val RECOVERY_COOLDOWN = 60_000L // 60 seconds between recovery attempts

    // Replace your current handleConnectionError method with this:
    private fun handleConnectionError(operation: String, error: Throwable) {
        connectionFailureCount++
        // Cap to prevent unbounded growth during very long offline periods
        if (connectionFailureCount > 100) connectionFailureCount = 100
        val timeSinceLastSuccess = System.currentTimeMillis() - lastSuccessfulConnection

        Log.e("GeekDS", "Connection error in $operation (failure #$connectionFailureCount): $error")
        Log.e("GeekDS", "Time since last successful connection: ${timeSinceLastSuccess / 1000}s")

        setState(State.ERROR, "$operation failed (attempt $connectionFailureCount)")

        // THROTTLE RECOVERY ATTEMPTS
        val now = System.currentTimeMillis()
        if (connectionFailureCount >= 5 && (now - lastRecoveryAttempt) > RECOVERY_COOLDOWN) {
            Log.w("GeekDS", "*** ATTEMPTING CONNECTION RECOVERY ***")
            lastRecoveryAttempt = now
            attemptConnectionRecovery()
        }

        // CIRCUIT BREAKER: Pause heartbeats after 12 consecutive failures
        if (operation == "heartbeat" && connectionFailureCount >= 12) {
            Log.w("GeekDS", "Circuit breaker triggered: 12 consecutive heartbeat failures")
            pauseHeartbeats()
            return
        }
    }

    private fun pauseHeartbeats() {
        if (heartbeatsPaused) return
        heartbeatsPaused = true
        Log.w("GeekDS", "Heartbeats paused after failures. Starting periodic health probe.")
        healthProbeJob?.cancel()
        healthProbeJob = scope.launch(Dispatchers.IO) {
            var done = false
            while (isActive && heartbeatsPaused && !done) {
                var delayMs = 300_000L  // 5 minutes when server is offline
                try {
                    if (!isNetworkConnected()) {
                        delayMs = 30_000L  // 30 seconds when network is down (will recover faster when network returns)
                    } else {
                        val req = Request.Builder().url("$cmsUrl/api/health").get().build()
                        client.newCall(req).execute().use { resp ->
                            if (resp.isSuccessful) {
                                Log.i("GeekDS", "Health probe success – resuming heartbeats")
                                heartbeatsPaused = false
                                lastSuccessfulConnection = System.currentTimeMillis()
                                connectionFailureCount = 0
                                done = true
                            }
                        }
                    }
                } catch (_: Exception) { }
                if (!done) delay(delayMs)
            }
        }
    }

    private fun attemptConnectionRecovery() {
        Log.i("GeekDS", "*** ATTEMPTING AGGRESSIVE CONNECTION RECOVERY ***")

        scope.launch {
            try {
                // Re-acquire wake lock if needed
                if (wakeLock?.isHeld != true) {
                    setupWakeLock()
                }

                // Wait a bit for things to settle
                delay(5000)

                // Check if we can reach the server
                if (isNetworkConnected()) {
                    Log.i("GeekDS", "Network appears available, attempting to reconnect")

                    // Reset failure count and try again
                    connectionFailureCount = 0

                    // Re-register if needed
                    if (deviceId == null) {
                        showRegistrationScreen()
                    } else {
                        // Try a unified heartbeat first
                        sendUnifiedHeartbeat()
                    }
                } else {
                    Log.w("GeekDS", "Network still not available after recovery attempt")
                }

            } catch (e: Exception) {
                Log.e("GeekDS", "Error during connection recovery", e)
            }
        }
    }

    private fun setState(newState: State, message: String) {
        state = newState
        runOnUiThread { statusView.text = "[$state] $message" }
        Log.d("GeekDS", "[$state] $message")
    }

    private fun saveDeviceId(id: Int) {
        getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .edit()
            .putInt("device_id", id)
            .apply()
    }

    private fun loadDeviceId(): Int? {
        val id = getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .getInt("device_id", -1)
        return if (id != -1) id else null
    }

    private fun saveDeviceName(name: String) {
        getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .edit()
            .putString("device_name", name)
            .apply()
        Log.i("GeekDS", "Device name saved: '$name'")
    }

    private fun loadDeviceName(): String? {
        return getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .getString("device_name", null)
    }

    private fun saveDeviceUuid(uuid: String) {
        getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .edit()
            .putString("device_uuid", uuid)
            .apply()
        Log.i("GeekDS", "Device UUID saved: '$uuid'")
    }

    private fun loadDeviceUuid(): String? {
        return getSharedPreferences("geekds_prefs", MODE_PRIVATE)
            .getString("device_uuid", null)
    }

    /**
     * Generate a durable UUID based on Android hardware ID
     * This UUID will:
     * - Be unique per device + app signing certificate combination
     * - Survive app reinstalls (same signing key)
     * - Be consistent across device lifetime (until factory reset)
     * - Not require any special permissions
     */
    private fun generateHardwareBasedUuid(): String {
        // Get Android ID (unique per device + app signature)
        val androidId = android.provider.Settings.Secure.getString(
            contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "fallback-${System.currentTimeMillis()}"

        // Create deterministic UUID from Android ID using UUID v5 (name-based)
        // This ensures same Android ID always generates same UUID
        val namespace = java.util.UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8") // DNS namespace
        val bytes = (namespace.toString() + androidId).toByteArray()
        val hash = java.security.MessageDigest.getInstance("SHA-1").digest(bytes)

        // Convert hash to UUID format
        hash[6] = ((hash[6].toInt() and 0x0f) or 0x50).toByte() // Version 5
        hash[8] = ((hash[8].toInt() and 0x3f) or 0x80).toByte() // Variant

        val uuid = java.util.UUID.nameUUIDFromBytes(hash)

        Log.i("GeekDS", "Hardware-based UUID generated from Android ID: ${androidId.take(8)}...")
        return uuid.toString()
    }

    // Claim or (re)create device on the server using durable UUID
    // Callback returns (success, newId)
    private fun claimDeviceByUuid(uuid: String, callback: (Boolean, Int?) -> Unit) {
        val ip = getLocalIpAddress() ?: "unknown"
        val body = JSONObject().apply {
            put("uuid", uuid)
            put("name", deviceName)
            put("ip", ip)
            put("system_info", JSONObject().apply {
                put("device_name", deviceName)
                put("current_ip", ip)
            })
        }.toString().toRequestBody("application/json".toMediaType())

        val req = Request.Builder()
            .url("$cmsUrl/api/devices/claim")
            .post(body)
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(false, null)
            }

            override fun onResponse(call: Call, response: Response) {
                try {
                    val resp = response.body?.string()
                    if (!response.isSuccessful || resp == null) {
                        callback(false, null)
                        return
                    }
                    val obj = JSONObject(resp)
                    val device = obj.getJSONObject("device")
                    val newId = device.getInt("id")
                    callback(true, newId)
                } catch (e: Exception) {
                    callback(false, null)
                }
            }
        })
    }

    // Utility: Get current device IP address (IPv4, non-loopback)
    private fun getLocalIpAddress(): String? {
        val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
        for (intf in interfaces) {
            val addrs = Collections.list(intf.inetAddresses)
            for (addr in addrs) {
                if (!addr.isLoopbackAddress && addr.hostAddress.indexOf(':') < 0) {
                    return addr.hostAddress
                }
            }
        }
        return null
    }

    // Updated startBackgroundTasks to add debug info
    private fun startBackgroundTasks() {
        scope.coroutineContext.cancelChildren()
        scheduleEnforcerJob?.cancel()
        Log.i("GeekDS", "Starting unified 20s heartbeat loop (pause-on-failure mode)")

        // Heartbeat loop every 20s when not paused
        scope.launch {
            while (isActive) {
                try {
                    if (!heartbeatsPaused && isNetworkConnected()) {
                        sendUnifiedHeartbeat()
                    } else if (heartbeatsPaused) {
                        Log.d("GeekDS", "Heartbeat paused – waiting for health probe")
                    } else {
                        Log.d("GeekDS", "No network – heartbeat skipped")
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Unified heartbeat loop error", e)
                }
                delay(10_000L)
            }
        }

        // Local schedule enforcement loop (no network dependency)
        scheduleEnforcerJob = scope.launch {
            delay(5_000L)
            while (isActive) {
                try { enforceSchedule() } catch (e: Exception) { Log.e("GeekDS", "Error in schedule enforcement", e) }
                delay(3_000L)
            }
        }

        // Wake lock maintenance
        scope.launch {
            while (isActive) {
                delay(5 * 60 * 1000L)
                if (wakeLock?.isHeld != true) {
                    Log.w("GeekDS", "Wake lock lost, re-acquiring")
                    setupWakeLock()
                }
            }
        }
    }
    // Unified merged heartbeat hitting /heartbeat endpoint
    private fun sendUnifiedHeartbeat() {
        val id = deviceId ?: return
        val ip = getLocalIpAddress() ?: "unknown"
        val bodyObj = JSONObject().apply {
            put("playback_state", if (isPlaylistActive) "playing" else "standby")
            put("versions", JSONObject().apply {
                put("schedule", lastKnownScheduleVersion)
                put("playlist", lastKnownPlaylistVersion)
                put("all_schedules", lastAllSchedulesVersion)
            })
            put("name", deviceName)
            put("ip", ip)
            put("uuid", deviceUuid ?: "")
        }
        val req = Request.Builder()
            .url("$cmsUrl/api/devices/$id/heartbeat")
            .patch(bodyObj.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(req).enqueue(object: Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("GeekDS", "Unified heartbeat failure: ${e.message}")
                handleConnectionError("heartbeat", e)
            }
            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    if (response.code == 404) {
                        Log.w("GeekDS", "Heartbeat 404 – device deleted server-side, clearing registration")
                        clearDeviceRegistration()
                        runOnUiThread { showRegistrationScreen() }
                        return
                    }
                    handleConnectionError("heartbeat", Exception("HTTP ${response.code}"))
                    return
                }
                try {
                    val txt = response.body?.string()
                    val json = JSONObject(txt ?: "{}")
                    val newVersions = json.optJSONObject("new_versions")
                    if (newVersions != null) {
                        lastKnownScheduleVersion = newVersions.optLong("schedule", lastKnownScheduleVersion)
                        lastKnownPlaylistVersion = newVersions.optLong("playlist", lastKnownPlaylistVersion)

                        // Track all_schedules version for detecting edits to inactive schedules
                        val serverAllSchedulesVersion = newVersions.optLong("all_schedules", 0L)
                        if (serverAllSchedulesVersion > 0 && serverAllSchedulesVersion != lastAllSchedulesVersion) {
                            Log.i("GeekDS", "All schedules version changed: $lastAllSchedulesVersion -> $serverAllSchedulesVersion")
                            // DON'T update lastAllSchedulesVersion here!
                            // It will be updated in fetchDeviceSchedule() AFTER successful cache
                        }
                    }
                    val scheduleChanged = json.optBoolean("schedule_changed", false)
                    val playlistChanged = json.optBoolean("playlist_changed", false)
                    val activePlaylistId = json.optInt("active_playlist_id", -1)

                    // Update device name if server sends it back
                    val serverDeviceName = json.optString("name", null)
                    if (serverDeviceName != null && serverDeviceName.isNotEmpty() && serverDeviceName != deviceName) {
                        Log.i("GeekDS", "Device name updated from server: '$deviceName' -> '$serverDeviceName'")
                        deviceName = serverDeviceName
                        saveDeviceName(serverDeviceName)
                    }

                    if (activePlaylistId > 0) {
                        // Active schedule exists
                        currentPlaylistId = activePlaylistId
                    } else {
                        // No active schedule now; if we previously had one, clear playback
                        if (lastKnownScheduleVersion > 0 && isPlaylistActive) {
                            Log.i("GeekDS", "Active schedule cleared on server – stopping playback")
                            runOnUiThread { stopCurrentPlayback() }
                        }
                        currentPlaylistId = null
                    }
                    lastSuccessfulConnection = System.currentTimeMillis()
                    connectionFailureCount = 0
                    if (heartbeatsPaused) {
                        heartbeatsPaused = false
                        healthProbeJob?.cancel()
                        Log.i("GeekDS", "Resumed heartbeats after successful unified heartbeat")
                    }
                    Log.d("GeekDS", "[IDLE] Unified heartbeat OK")

                    // Check for screenshot commands
                    val commands = json.optJSONArray("commands")
                    if (commands != null && commands.length() > 0) {
                        for (i in 0 until commands.length()) {
                            val cmd = commands.getJSONObject(i)
                            val type = cmd.optString("type")
                            if (type == "screenshot_request") {
                                Log.i("GeekDS", "Screenshot command received from heartbeat")
                                scope.launch(Dispatchers.Main) {
                                    delay(1000) // Give UI time to settle
                                    takeScreenshot()
                                }
                            }
                        }
                    }

                    // Detect implicit schedule clear (server returns version 0) even if schedule_changed false
                    val implicitScheduleCleared = (lastKnownScheduleVersion == 0L && scheduleChanged.not() && currentPlaylistId == null)
                    if (scheduleChanged || implicitScheduleCleared) {
                        // Only fetch schedule if server thinks something changed OR we saw a clear
                        fetchDeviceSchedule()
                    } else if (playlistChanged && currentPlaylistId != null) {
                        fetchPlaylist(currentPlaylistId!!)
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error parsing unified heartbeat response", e)
                }
            }
        })
    }

    private fun fetchDeviceSchedule() {
        val id = deviceId ?: return

        // FIRST: Fetch ALL schedules for offline caching
        val allSchedulesReq = Request.Builder()
            .url("$cmsUrl/api/devices/$id/schedules/all")
            .get()
            .build()

        client.newCall(allSchedulesReq).enqueue(object: Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w("GeekDS", "Failed to fetch all schedules: ${e.message}")
                // Try to use cached schedules in offline mode
                val cachedSchedules = loadAllSchedules(this@MainActivity)
                if (cachedSchedules != null && cachedSchedules.isNotEmpty()) {
                    Log.i("GeekDS", "Using ${cachedSchedules.size} cached schedules (OFFLINE MODE)")
                    enforceScheduleWithMultiple(cachedSchedules)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    Log.w("GeekDS", "All schedules fetch HTTP ${response.code}")
                    return
                }

                try {
                    val txt = response.body?.string()
                    val json = JSONObject(txt ?: "{}")

                    // CHECK VERSION FIRST - only process if version changed
                    val serverVersion = json.optLong("version", 0L)
                    if (serverVersion > 0 && serverVersion == lastAllSchedulesVersion) {
                        Log.d("GeekDS", "All schedules version unchanged ($serverVersion), skipping fetch")
                        // Still trigger enforcement with cached data
                        val cachedSchedules = loadAllSchedules(this@MainActivity)
                        if (cachedSchedules != null && cachedSchedules.isNotEmpty()) {
                            enforceScheduleWithMultiple(cachedSchedules)
                        }
                        return
                    }

                    val schedulesArray = json.getJSONArray("schedules")
                    val schedules = mutableListOf<Schedule>()

                    for (i in 0 until schedulesArray.length()) {
                        val sched = schedulesArray.getJSONObject(i)
                        schedules.add(Schedule(
                            playlistId = sched.getInt("playlist_id"),
                            name = sched.optString("name", null),
                            daysOfWeek = sched.getJSONArray("days_of_week").let { a ->
                                (0 until a.length()).map { a.getString(it) }
                            },
                            timeSlotStart = sched.getString("time_slot_start"),
                            timeSlotEnd = sched.getString("time_slot_end"),
                            validFrom = sched.optString("valid_from", null),
                            validUntil = sched.optString("valid_until", null),
                            isEnabled = sched.getBoolean("is_enabled")
                        ))
                    }

                    if (schedules.isNotEmpty()) {
                        // Update version tracking BEFORE caching
                        lastAllSchedulesVersion = serverVersion

                        // Cache ALL schedules for offline operation
                        saveAllSchedules(this@MainActivity, schedules)
                        Log.i("GeekDS", "Cached ${schedules.size} schedules (version $serverVersion) for offline switching")

                        // Pre-download all playlists for offline use
                        schedules.forEach { schedule ->
                            fetchAndCachePlaylist(schedule.playlistId)
                        }

                        // Apply current schedule immediately
                        enforceScheduleWithMultiple(schedules)
                    } else {
                        Log.i("GeekDS", "No schedules assigned to this device")
                        clearLocalData()
                        runOnUiThread { stopCurrentPlayback() }
                    }

                } catch (e: Exception) {
                    Log.e("GeekDS", "Error parsing all schedules", e)
                }
            }
        })

        // SECOND: Also fetch the currently active schedule for immediate playback
        val req = Request.Builder().url("$cmsUrl/api/devices/$id/schedule").get().build()
        client.newCall(req).enqueue(object: Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("GeekDS", "fetchDeviceSchedule failed: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) return
                try {
                    val txt = response.body?.string()
                    val json = JSONObject(txt ?: "{}")
                    lastKnownScheduleVersion = json.optLong("version", lastKnownScheduleVersion)
                    lastKnownPlaylistVersion = json.optLong("playlist_version", lastKnownPlaylistVersion)
                    val sched = json.optJSONObject("schedule")
                    if (sched == null) {
                        // No active schedule now – clear local persisted schedule & stop playback
                        Log.i("GeekDS", "Server reports no active schedule; clearing local schedule")
                        clearLocalData()
                        runOnUiThread { stopCurrentPlayback() }
                        return
                    }
                    val schedule = Schedule(
                        playlistId = sched.getInt("playlist_id"),
                        name = sched.optString("name", null),
                        daysOfWeek = sched.getJSONArray("days_of_week").let { a -> (0 until a.length()).map { a.getString(it) } },
                        timeSlotStart = sched.getString("time_slot_start"),
                        timeSlotEnd = sched.getString("time_slot_end"),
                        validFrom = sched.optString("valid_from", null),
                        validUntil = sched.optString("valid_until", null),
                        isEnabled = sched.getBoolean("is_enabled")
                    )
                    saveSchedule(this@MainActivity, schedule)
                    currentPlaylistId = schedule.playlistId
                    fetchPlaylist(schedule.playlistId)
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error processing device schedule", e)
                }
            }
        })
    }

    // Helper function to fetch and cache playlists for offline use
    private fun fetchAndCachePlaylist(playlistId: Int) {
        val req = Request.Builder()
            .url("$cmsUrl/api/playlists/$playlistId")
            .get()
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w("GeekDS", "Failed to pre-cache playlist $playlistId: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) return

                try {
                    val resp = response.body?.string()
                    val obj = JSONObject(resp)
                    val mediaDetailsJson = obj.optJSONArray("media_details")
                    val mediaFiles = mutableListOf<MediaFile>()

                    if (mediaDetailsJson != null) {
                        for (i in 0 until mediaDetailsJson.length()) {
                            val media = mediaDetailsJson.getJSONObject(i)
                            mediaFiles.add(
                                MediaFile(
                                    filename = media.getString("filename"),
                                    duration = media.optInt("duration", 0),
                                    type = media.optString("type", "video/mp4")
                                )
                            )
                        }
                    } else {
                        val mediaFilesJson = obj.getJSONArray("media_files")
                        for (i in 0 until mediaFilesJson.length()) {
                            val media = mediaFilesJson.getJSONObject(i)
                            mediaFiles.add(
                                MediaFile(
                                    filename = media.getString("filename"),
                                    duration = media.optInt("duration", 0),
                                    type = media.optString("type", "video/mp4")
                                )
                            )
                        }
                    }

                    val playlist = Playlist(id = playlistId, mediaFiles = mediaFiles)
                    savePlaylistById(this@MainActivity, playlistId, playlist)
                    Log.i("GeekDS", "Cached playlist $playlistId with ${mediaFiles.size} files")

                    // Start downloading media files in background for offline use
                    mediaFiles.forEach { mediaFile ->
                        val file = File(getExternalFilesDir(null), mediaFile.filename)
                        if (!file.exists() || file.length() == 0L) {
                            downloadMediaWithCallback(mediaFile.filename) { success ->
                                if (success) {
                                    Log.i("GeekDS", "Pre-downloaded media: ${mediaFile.filename}")
                                }
                            }
                        }
                    }

                } catch (e: Exception) {
                    Log.e("GeekDS", "Error caching playlist $playlistId", e)
                }
            }
        })
    }

    private fun clearDeviceRegistration() {
        Log.w("GeekDS", "Clearing device registration - invalidating all cached data except UUID")

        deviceId = null
        isPlaylistActive = false
        currentPlaylistId = null
        lastKnownScheduleVersion = 0
        lastKnownPlaylistVersion = 0
        lastAllSchedulesVersion = 0

        val sharedPrefs = getSharedPreferences("DevicePrefs", Context.MODE_PRIVATE)
        with(sharedPrefs.edit()) {
            putInt("device_id", -1) // Use -1 as invalid device ID
            apply()
        }

        // Clear ALL cached data from main prefs EXCEPT device_uuid
        val mainPrefs = getSharedPreferences("geekds_prefs", MODE_PRIVATE)
        val savedUuid = mainPrefs.getString("device_uuid", null) // Preserve UUID

        // Get all keys and filter out only UUID
        val allKeys = mainPrefs.all.keys
        val editor = mainPrefs.edit()

        allKeys.forEach { key ->
            if (key != "device_uuid") {
                editor.remove(key)
                Log.d("GeekDS", "Cleared cached key: $key")
            }
        }
        editor.apply()

        Log.i("GeekDS", "Cleared all cached schedules, playlists, and preferences (preserved UUID: ${savedUuid?.take(8)}...)")

        deviceName = "ARC-A-GR-18" // Reset to default

        // Delete all downloaded media files to free space
        try {
            val mediaDir = getExternalFilesDir(null)
            if (mediaDir != null && mediaDir.exists()) {
                val files = mediaDir.listFiles()
                var deletedCount = 0
                files?.forEach { file ->
                    if (file.isFile && file.name != "config.json") { // Keep config.json
                        if (file.delete()) {
                            deletedCount++
                            Log.d("GeekDS", "Deleted cached media: ${file.name}")
                        }
                    }
                }
                Log.i("GeekDS", "Deleted $deletedCount cached media files")
            }
        } catch (e: Exception) {
            Log.e("GeekDS", "Error deleting cached media files", e)
        }

        // Stop all background activities
        stopAllActivities()
    }

    private fun stopAllActivities() {
        try {
            // Cancel all background jobs gracefully
            scheduleEnforcerJob?.cancel()

            // Use a new scope for stopping activities to avoid cancellation issues
            runOnUiThread {
                try {
                    // Stop player safely
                    player?.stop()
                    player?.release()
                    player = null
                    playerView = null
                    videoTextureView = null                    // Show standby screen
                    showStandby()

                    Log.i("GeekDS", "All activities stopped for re-registration")
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error stopping activities", e)
                }
            }

            // Cancel background jobs after UI cleanup
            scope.coroutineContext.cancelChildren()

        } catch (e: Exception) {
            Log.e("GeekDS", "Error in stopAllActivities", e)
        }
    }

    private fun showRegistrationScreen() {
        runOnUiThread {
            // Stop all activities first
            stopAllActivities()
            setState(State.REGISTERING, "Device needs registration...")

            // Show registration dialog immediately while requesting code
            showWaitingDialog()

            // Request a registration code from the server
            val ip = getLocalIpAddress() ?: "unknown"
            // Start polling immediately by IP/UUID as a safety net
            startRegistrationPolling(ip)
            requestRegistrationCode()
        }
    }

    private var currentRegistrationDialog: AlertDialog? = null

    private fun showWaitingDialog() {
        currentRegistrationDialog?.dismiss()
        currentRegistrationDialog = AlertDialog.Builder(this)
            .setTitle("Device Registration Required")
            .setMessage("Requesting registration code from server...\n\nPlease wait...")
            .setCancelable(false)
            .show()
    }

    private fun requestRegistrationCode() {
        val currentIp = getLocalIpAddress() ?: "unknown"
        val currentUuid = deviceUuid ?: "unknown"

        val json = JSONObject().apply {
            put("ip", currentIp)
            put("uuid", currentUuid)  // Send UUID for server-side tracking
        }

        val body = json.toString().toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$cmsUrl/api/devices/register-request")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    setState(State.ERROR, "Failed to request registration code: ${e.message}")
                    showErrorDialog("Network Error", "Could not connect to server to get registration code.\n\nRetrying in 5 seconds...")
                    handler.postDelayed({ requestRegistrationCode() }, 5000)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()

                if (response.isSuccessful && responseBody != null) {
                    try {
                        val jsonResponse = JSONObject(responseBody)
                        val code = jsonResponse.getString("code")

                        runOnUiThread {
                            showRegistrationDialog(code)
                            startRegistrationPolling(currentIp)
                        }
                    } catch (e: Exception) {
                        runOnUiThread {
                            setState(State.ERROR, "Failed to parse registration response")
                            showErrorDialog("Server Error", "Invalid response from server.\n\nRetrying in 5 seconds...")
                            handler.postDelayed({ requestRegistrationCode() }, 5000)
                        }
                    }
                } else {
                    runOnUiThread {
                        setState(State.ERROR, "Failed to get registration code: HTTP ${response.code}")
                        showErrorDialog("Server Error", "Server returned error: ${response.code}\n\nRetrying in 5 seconds...")
                        handler.postDelayed({ requestRegistrationCode() }, 5000)
                    }
                }
            }
        })
    }

    private fun showErrorDialog(title: String, message: String) {
        currentRegistrationDialog?.dismiss()
        currentRegistrationDialog = AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("Retry Now") { _, _ ->
                requestRegistrationCode()
            }
            .setCancelable(false)
            .show()
    }

    private fun startRegistrationPolling(ip: String) {
        // Stop any existing polling
        registrationPollingRunnable?.let { handler.removeCallbacks(it) }
        registrationCheckAttempts = 0 // Reset attempt counter

        registrationPollingRunnable = object : Runnable {
            override fun run() {
                val attempt = registrationCheckAttempts + 1
                Log.d("GeekDS", "[REGISTERING] Poll attempt=$attempt")
                val uuid = deviceUuid
                if (uuid != null) {
                    Log.d("GeekDS", "[REGISTERING] Checking registration by UUID ONLY: $uuid")
                    checkRegistrationByUuid(uuid, this)
                } else {
                    Log.e("GeekDS", "[REGISTERING] ERROR: No UUID available! Cannot check registration.")
                    // Retry generating UUID
                    deviceUuid = generateHardwareBasedUuid()
                    saveDeviceUuid(deviceUuid!!)
                    handler.postDelayed(this, 5000)
                }
            }
        }

        // Start polling immediately
        Log.d("GeekDS", "[REGISTERING] Starting polling loop now")
        handler.post(registrationPollingRunnable!!)
    }

    // Exponential backoff for registration polling: 1s, 2s, 4s, 8s, 15s max
    private fun calculateRegistrationDelay(): Long {
        val baseDelay = 1000L
        val maxDelay = 15000L
        val attempt = if (registrationCheckAttempts < 1) 1 else registrationCheckAttempts
        val delay = baseDelay * (1L shl minOf(attempt - 1, 4))
        return minOf(delay, maxDelay)
    }

    // DEPRECATED: IP-based registration is unreliable (DHCP can reassign IPs)
    // Kept for reference only - do not use
    // Use checkRegistrationByUuid() instead
    /*
    private fun checkRegistrationStatus(ip: String, pollingRunnable: Runnable) {
        registrationCheckAttempts++

        val request = Request.Builder()
            .url("$cmsUrl/api/devices/check-registration/$ip")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (state == State.REGISTERING) {
                    val delay = calculateRegistrationDelay()
                    Log.d("GeekDS", "[REGISTERING] IP check failed, retrying in ${delay}ms: ${e.message}")
                    handler.postDelayed(pollingRunnable, delay)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string()

                if (response.isSuccessful && responseBody != null) {
                    try {
                        val jsonResponse = JSONObject(responseBody)
                        val registered = jsonResponse.getBoolean("registered")

                        if (registered) {
                            val deviceJson = jsonResponse.getJSONObject("device")
                            val newDeviceId = deviceJson.getInt("id")
                            val newDeviceName = deviceJson.getString("name")

                            runOnUiThread {
                                stopRegistrationPolling()
                                currentRegistrationDialog?.dismiss()
                                saveDeviceId(newDeviceId)
                                saveDeviceName(newDeviceName)
                                deviceId = newDeviceId
                                deviceName = newDeviceName
                                setState(State.IDLE, "Device registered (via IP)")
                                startBackgroundTasks()
                            }
                            return
                        } else {
                            if (state == State.REGISTERING) {
                                val delay = calculateRegistrationDelay()
                                Log.d("GeekDS", "[REGISTERING] Not registered by IP yet, retry in ${delay}ms")
                                handler.postDelayed(pollingRunnable, delay)
                            }
                        }
                    } catch (e: Exception) {
                        if (state == State.REGISTERING) {
                            val delay = calculateRegistrationDelay()
                            Log.d("GeekDS", "[REGISTERING] Parse error, retry in ${delay}ms: ${e.message}")
                            handler.postDelayed(pollingRunnable, delay)
                        }
                    }
                } else {
                    if (state == State.REGISTERING) {
                        val delay = calculateRegistrationDelay()
                        Log.d("GeekDS", "[REGISTERING] HTTP ${response.code}, retry in ${delay}ms")
                        handler.postDelayed(pollingRunnable, delay)
                    }
                }
            }
        })
    }
    */

    private fun stopRegistrationPolling() {
        registrationPollingRunnable?.let { handler.removeCallbacks(it) }
        Log.d("GeekDS", "[REGISTERING] Stopped polling loop")
        registrationPollingRunnable = null
    }

    private fun showRegistrationDialog(code: String) {
        currentRegistrationDialog?.dismiss()
        currentRegistrationDialog = AlertDialog.Builder(this)
            .setTitle("Device Registration")
            .setMessage("Please register this device in the CMS dashboard:\n\n" +
                    "Registration Code: $code\n\n" +
                    "Steps:\n" +
                    "1. Open CMS Dashboard\n" +
                    "2. Click 'Add Device'\n" +
                    "3. Enter code: $code\n" +
                    "4. Enter device name\n" +
                    "5. Click 'Register'\n\n" +
                    "Waiting for registration with smart retry...")
            .setPositiveButton("Check Now") { _, _ ->
                // Reset attempts for immediate check
                registrationCheckAttempts = 0
                registrationPollingRunnable?.let {
                    handler.removeCallbacks(it)
                    handler.post(it) // Check immediately
                }
                // Redisplay the dialog
                showRegistrationDialog(code)
            }
            .setNegativeButton("Get New Code") { _, _ ->
                stopRegistrationPolling()
                requestRegistrationCode()
            }
            .setNeutralButton("Check Network") { _, _ ->
                showNetworkInfo()
            }
            .setCancelable(false)
            .show()
    }

    private fun showNetworkInfo() {
        val ip = getLocalIpAddress() ?: "No IP"
        val networkConnected = isNetworkConnected()

        currentRegistrationDialog?.dismiss()
        currentRegistrationDialog = AlertDialog.Builder(this)
            .setTitle("Network Information")
            .setMessage("Device IP: $ip\n" +
                    "Network Connected: ${if(networkConnected) "Yes" else "No"}\n" +
                    "Server URL: $cmsUrl\n\n" +
                    "Make sure:\n" +
                    "• Device has internet connection\n" +
                    "• CMS server is running\n" +
                    "• Server URL is correct")
            .setPositiveButton("Continue Registration") { _, _ ->
                requestRegistrationCode()
            }
            .setNegativeButton("Retry Connection") { _, _ ->
                requestRegistrationCode()
            }
            .setCancelable(false)
            .show()
    }

    // FIXED: Update the sync method to use UTC consistently
    private fun syncScheduleAndMedia() {
        if (!isNetworkConnected()) {
            Log.w("GeekDS", "Cannot sync - no network connection")
            return
        }
        setState(State.SYNCING, "Syncing schedule...")
        val id = deviceId ?: return
        val req = Request.Builder()
            .url("$cmsUrl/api/schedules")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                setState(State.ERROR, "Failed to fetch schedules: $e")
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    setState(State.ERROR, "Failed to fetch schedules: ${response.code}")
                    return
                }

                try {
                    lastSuccessfulConnection = System.currentTimeMillis()
                    connectionFailureCount = 0

                    val resp = response.body?.string()
                    val arr = JSONArray(resp)
                    val mySchedules = (0 until arr.length())
                        .map { arr.getJSONObject(it) }
                        .filter { it.getInt("device_id") == id && it.getBoolean("is_enabled") }

                    if (mySchedules.isNotEmpty()) {
                        // Get current time components in UTC
                        val now = ZonedDateTime.now(ZoneId.of("UTC"))
                        val currentDay = now.dayOfWeek.name.lowercase()
                        val currentTime = now.format(DateTimeFormatter.ofPattern("HH:mm"))

                        // Helper function to convert HH:mm time to minutes since midnight
                        fun timeToMinutes(timeStr: String): Int {
                            val (hours, minutes) = timeStr.split(":").map { it.toInt() }
                            return hours * 60 + minutes
                        }

                        // Find currently active schedule
                        val activeSchedule = mySchedules.find { sched ->
                            // Check validity period
                            // Parse validity dates with flexible format support
                            fun parseValidityDate(dateStr: String?): LocalDate? {
                                // Treat null, "null", or blank as no limit (always valid)
                                if (dateStr == null || dateStr.trim().isEmpty() || dateStr.equals("null", ignoreCase = true)) return null
                                return try {
                                    // Try parsing as ISO datetime first
                                    ZonedDateTime.parse(dateStr).toLocalDate()
                                } catch (e: Exception) {
                                    try {
                                        // Then try as simple date
                                        LocalDate.parse(dateStr)
                                    } catch (e: Exception) {
                                        Log.e("GeekDS", "Failed to parse validity date: $dateStr", e)
                                        null
                                    }
                                }
                            }

                            val validFrom = sched.optString("valid_from", null)
                            val validUntil = sched.optString("valid_until", null)
                            val validFromDate = parseValidityDate(validFrom)
                            val validUntilDate = parseValidityDate(validUntil)

                            val withinValidPeriod = (validFromDate == null || !now.toLocalDate().isBefore(validFromDate)) &&
                                    (validUntilDate == null || !now.toLocalDate().isAfter(validUntilDate))

                            // Check day of week
                            val days = sched.getJSONArray("days_of_week").let { days ->
                                (0 until days.length()).map { days.getString(it) }
                            }
                            val isActiveDay = days.contains(currentDay)

                            // Check time slot
                            val timeSlotStart = sched.getString("time_slot_start")
                            val timeSlotEnd = sched.getString("time_slot_end")

                            val currentMinutes = timeToMinutes(currentTime)
                            val startMinutes = timeToMinutes(timeSlotStart)
                            val endMinutes = timeToMinutes(timeSlotEnd)
                            val inTimeSlot = currentMinutes in startMinutes..endMinutes

                            Log.d("GeekDS", "[SYNC] Time check: current=${currentTime}(${currentMinutes}m) slot=${timeSlotStart}-${timeSlotEnd}(${startMinutes}m-${endMinutes}m)")
                            Log.d("GeekDS", "[SYNC] In time slot: $inTimeSlot")

                            withinValidPeriod && isActiveDay && inTimeSlot
                        }

                        if (activeSchedule != null) {
                            Log.i("GeekDS", "Found active schedule: ${activeSchedule.optString("name", "unnamed")}")

                            val scheduleTimestamp = activeSchedule.optString("schedule_updated_at")
                            val playlistTimestamp = activeSchedule.optString("playlist_updated_at")
                            val scheduleChanged = scheduleTimestamp != lastScheduleTimestamp
                            val playlistChanged = playlistTimestamp != lastPlaylistTimestamp
                            val playlistSwitched = currentPlaylistId != activeSchedule.getInt("playlist_id")

                            if (scheduleChanged || playlistChanged || playlistSwitched) {
                                if (scheduleChanged) Log.i("GeekDS", "Schedule metadata changed")
                                if (playlistChanged) Log.i("GeekDS", "Playlist content changed")
                                if (playlistSwitched) Log.i("GeekDS", "Different playlist assigned")

                                // Update timestamps before fetching
                                lastScheduleTimestamp = scheduleTimestamp
                                lastPlaylistTimestamp = playlistTimestamp

                                val playlistId = activeSchedule.getInt("playlist_id")

                                val schedule = Schedule(
                                    playlistId = playlistId,
                                    name = activeSchedule.optString("name"),
                                    daysOfWeek = (0 until activeSchedule.getJSONArray("days_of_week").length())
                                        .map { activeSchedule.getJSONArray("days_of_week").getString(it) },
                                    timeSlotStart = activeSchedule.getString("time_slot_start"),
                                    timeSlotEnd = activeSchedule.getString("time_slot_end"),
                                    validFrom = activeSchedule.optString("valid_from", null),
                                    validUntil = activeSchedule.optString("valid_until", null),
                                    isEnabled = activeSchedule.getBoolean("is_enabled")
                                )
                                saveSchedule(this@MainActivity, schedule)

                                // Only fetch playlist if it actually changed or switched
                                if (playlistChanged || playlistSwitched) {
                                    fetchPlaylist(playlistId)
                                } else {
                                    // Schedule changed but playlist is the same - no need to restart playback
                                    setState(State.IDLE, "Schedule updated, playlist unchanged")
                                }
                            } else {
                                Log.i("GeekDS", "Schedule unchanged")
                                setState(State.IDLE, "Schedule up to date")
                            }
                        } else {
                            Log.i("GeekDS", "No active schedule for current time")
                            setState(State.IDLE, "No active schedule for now")
                            runOnUiThread { stopCurrentPlayback() }
                            clearLocalData()
                        }
                    } else {
                        Log.i("GeekDS", "No schedules found for this device")
                        setState(State.IDLE, "No schedule assigned")
                        runOnUiThread { stopCurrentPlayback() }
                        clearLocalData()
                    }
                } catch (e: Exception) {
                    handleConnectionError("sync", e)
                }
            }
        })
    }

    private fun clearLocalData() {
        val prefs = getSharedPreferences("geekds_prefs", MODE_PRIVATE)
        prefs.edit()
            .remove("schedule")
            .remove("playlist")
            .remove("all_schedules")  // CRITICAL: Clear cached schedules too!
            .apply()
        isPlaylistActive = false
        currentPlaylistId = null
        lastScheduleTimestamp = null
        lastPlaylistTimestamp = null
        // Reset version tracking so fresh fetch happens
        lastAllSchedulesVersion = 0L
        lastKnownScheduleVersion = 0L
        Log.i("GeekDS", "Cleared all local schedule and playlist data")
    }


    // Add this new method to properly stop playback
    // Enhanced stopCurrentPlayback method
    private fun stopCurrentPlayback() {
        Log.i("GeekDS", "*** STOPPING CURRENT PLAYBACK ***")

        // Release the player
        player?.let {
            Log.i("GeekDS", "Releasing ExoPlayer")
            it.stop()
            it.release()
        }
        player = null
        playerView = null

        // Show standby screen with image
        showStandby()

        Log.i("GeekDS", "*** PLAYBACK STOPPED - STANDBY ACTIVE ***")
    }

    // Helper to parse ISO8601 string to epoch millis, supports with and without milliseconds
    private fun parseIso8601ToMillis(iso: String): Long {
        return try {
            val formats = arrayOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'"
            )
            for (format in formats) {
                try {
                    val sdf = java.text.SimpleDateFormat(format, java.util.Locale.US)
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val date = sdf.parse(iso)
                    if (date != null) return date.time
                } catch (_: Exception) {
                }
            }
            0L
        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to parse date: $iso", e)
            0L
        }
    }

    // Simple approach - get current time in Egypt timezone

    // FIXED: Remove all the timezone bullshit and just work in UTC
    private fun getCurrentUtcTimeMillis(): Long {
        return System.currentTimeMillis() // This is already UTC!
    }

    // FIXED: Parse UTC times and keep them as UTC
    private fun parseIso8601ToUtcMillis(iso: String): Long {
        return try {
            val formats = arrayOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss"
            )

            for (format in formats) {
                try {
                    val sdf = SimpleDateFormat(format, java.util.Locale.US)
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val utcDate = sdf.parse(iso)

                    if (utcDate != null) {
                        val utcTime = utcDate.time
                        Log.i("GeekDS", "Parsed UTC $iso to $utcTime (${Date(utcTime)})")
                        return utcTime
                    }
                } catch (_: Exception) {
                    // Try next format
                }
            }

            Log.e("GeekDS", "Could not parse date with any format: $iso")
            return 0L

        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to parse UTC date: $iso", e)
            0L
        }
    }
    // FIXED: Force GMT+3 for Egypt (fuck the broken timezone library)
    private fun getCurrentEgyptTimeMillis(): Long {
        val now = System.currentTimeMillis()

        // FORCE GMT+3 offset (3 hours * 60 minutes * 60 seconds * 1000 milliseconds)
        val egyptOffset = 3 * 60 * 60 * 1000L
        val egyptTime = now + egyptOffset

        // For debugging - show both times
        val egyptDate = Date(egyptTime)
        val utcDate = Date(now)

        Log.d("GeekDS", "UTC time: $utcDate ($now)")
        Log.d("GeekDS", "Egypt time (FORCED GMT+3): $egyptDate ($egyptTime)")

        return egyptTime
    }



    // FIXED: Force GMT+3 conversion from UTC (fuck the broken timezone library)
    private fun parseIso8601ToMillisEgypt(iso: String): Long {
        return try {
            val formats = arrayOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss"
            )

            for (format in formats) {
                try {
                    val sdf = SimpleDateFormat(format, java.util.Locale.US)
                    sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                    val utcDate = sdf.parse(iso)

                    if (utcDate != null) {
                        val utcTime = utcDate.time

                        // FORCE GMT+3 offset (3 hours * 60 minutes * 60 seconds * 1000 milliseconds)
                        val egyptOffset = 3 * 60 * 60 * 1000L
                        val egyptTime = utcTime + egyptOffset

                        Log.i("GeekDS", "Parsed UTC $iso ($utcTime) to Egypt time (FORCED GMT+3): ${Date(egyptTime)} ($egyptTime)")
                        Log.i("GeekDS", "UTC Date: ${Date(utcTime)}")
                        Log.i("GeekDS", "Applied FORCED +3 hours offset")

                        return egyptTime
                    }
                } catch (_: Exception) {
                    // Try next format
                }
            }

            Log.e("GeekDS", "Could not parse date with any format: $iso")
            return 0L

        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to parse Egypt date: $iso", e)
            0L
        }
    }

    private fun fetchPlaylist(playlistId: Int) {
        setState(State.SYNCING, "Fetching playlist $playlistId...")
        val req = Request.Builder()
            .url("$cmsUrl/api/playlists/$playlistId")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                setState(State.ERROR, "Failed to fetch playlist: $e")
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    setState(State.ERROR, "Failed to fetch playlist: ${response.code}")
                    return
                }
                val resp = response.body?.string()
                val obj = JSONObject(resp)

                val playlistTimestamp = obj.optString("updated_at")
                Log.i("GeekDS", "Processing playlist response...")

                // Always process the playlist data, regardless of timestamp
                // Track if this update affects the current playlist
                val isCurrentPlaylist = playlistId == currentPlaylistId

                // Use media_details if available, fallback to media_files
                val mediaDetailsJson = obj.optJSONArray("media_details")
                val mediaFiles = mutableListOf<MediaFile>()

                if (mediaDetailsJson != null) {
                    for (i in 0 until mediaDetailsJson.length()) {
                        val media = mediaDetailsJson.getJSONObject(i)
                        mediaFiles.add(
                            MediaFile(
                                filename = media.getString("filename"),
                                duration = media.optInt("duration", 0),
                                type = media.optString("type", "video/mp4")
                            )
                        )
                    }
                } else {
                    // Fallback to old format
                    val mediaFilesJson = obj.getJSONArray("media_files")
                    for (i in 0 until mediaFilesJson.length()) {
                        val media = mediaFilesJson.getJSONObject(i)
                        mediaFiles.add(
                            MediaFile(
                                filename = media.getString("filename"),
                                duration = media.optInt("duration", 0),
                                type = media.optString("type", "video/mp4")
                            )
                        )
                    }
                }

                val playlist = Playlist(id = playlistId, mediaFiles = mediaFiles)

                // Check if playlist content actually changed by comparing with saved playlist
                val savedPlaylist = loadPlaylist(this@MainActivity)
                val contentChanged = savedPlaylist == null ||
                        savedPlaylist.mediaFiles.size != playlist.mediaFiles.size ||
                        savedPlaylist.mediaFiles.zip(playlist.mediaFiles).any { (old, new) ->
                            old.filename != new.filename
                        }

                savePlaylist(this@MainActivity, playlist)

                // Download media - the download process will handle starting playback when ready
                Log.i("GeekDS", "Starting media download for playlist $playlistId with ${mediaFiles.size} files (content changed: $contentChanged)")

                // Only proceed if this differs from current or not yet active OR content changed
                val shouldDownload = !isPlaylistActive || currentPlaylistId != playlistId || player == null || contentChanged
                if (shouldDownload) {
                    downloadPlaylistMedia(playlist)
                    setState(State.IDLE, "Media synced. Downloading files...")
                } else {
                    Log.i("GeekDS", "Playlist unchanged and already playing – skipping reload")
                    setState(State.IDLE, "Playlist unchanged")
                }
            }
        })
    }

    private fun downloadPlaylistMedia(playlist: Playlist) {
        setState(State.SYNCING, "Downloading media files...")
        var downloadCount = 0
        val totalFiles = playlist.mediaFiles.size

        if (totalFiles == 0) {
            setState(State.IDLE, "No media files to download")
            return
        }

        // Track which files we're downloading vs already have
        val filesToDownload = playlist.mediaFiles.filter { mediaFile ->
            val file = File(getExternalFilesDir(null), mediaFile.filename)
            !file.exists() || file.length() == 0L
        }

        if (filesToDownload.isEmpty()) {
            Log.i("GeekDS", "All files already downloaded, ready to play")
            setState(State.IDLE, "All media files ready")
            // All files are ready, we can start playback immediately if needed
            triggerPlaybackIfReady(playlist)
            return
        }

        Log.i("GeekDS", "Need to download ${filesToDownload.size} files")

        filesToDownload.forEach { mediaFile ->
            downloadMediaWithCallback(mediaFile.filename) { success ->
                downloadCount++
                if (success) {
                    Log.i("GeekDS", "Downloaded: ${mediaFile.filename}")
                } else {
                    Log.e("GeekDS", "Failed to download: ${mediaFile.filename}")
                }

                if (downloadCount == filesToDownload.size) {
                    setState(State.IDLE, "All media files processed ($downloadCount/${filesToDownload.size})")
                    // All downloads complete, now we can safely start playback
                    triggerPlaybackIfReady(playlist)
                }
            }
        }
    }

    // New method to trigger playback only when files are ready
    private fun triggerPlaybackIfReady(playlist: Playlist) {
        // Only start playback if we should be playing right now
        if (isPlaylistActive && currentPlaylistId == playlist.id) {
            Log.i("GeekDS", "Downloads complete - starting playback")
            runOnUiThread {
                startPlaylistPlayback(playlist)
            }
        } else {
            Log.i("GeekDS", "Downloads complete but playback not currently needed")
        }
    }

    // Updated download function with callback and proper file completion detection
    private fun downloadMediaWithCallback(filename: String, callback: (Boolean) -> Unit) {
        val file = File(getExternalFilesDir(null), filename)
        if (file.exists() && file.length() > 0) {
            Log.i("GeekDS", "File already exists: $filename (${file.length()} bytes)")
            callback(true) // Already exists and has content
            return
        }

        Log.i("GeekDS", "Starting download: $filename")

        // URL encode the filename to handle spaces and special characters
        val encodedFilename = java.net.URLEncoder.encode(filename, "UTF-8").replace("+", "%20")
        Log.d("GeekDS", "Encoded filename: $encodedFilename")

        val req = Request.Builder()
            .url("$cmsUrl/api/media/$encodedFilename")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("GeekDS", "Download failed: $filename $e")
                callback(false)
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    Log.e("GeekDS", "Download failed: $filename ${response.code}")
                    callback(false)
                    return
                }
                try {
                    val responseBody = response.body
                    if (responseBody == null) {
                        Log.e("GeekDS", "Download failed: $filename - no response body")
                        callback(false)
                        return
                    }

                    // Write to a temporary file first
                    val tempFile = File(file.parent, "${filename}.tmp")
                    val sink = FileOutputStream(tempFile)

                    val inputStream = responseBody.byteStream()
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalBytes = 0L

                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        sink.write(buffer, 0, bytesRead)
                        totalBytes += bytesRead
                    }

                    // Ensure all data is written and flushed
                    sink.flush()
                    sink.close()
                    inputStream.close()

                    // Verify the download completed successfully
                    if (tempFile.exists() && tempFile.length() > 0) {
                        // Move temp file to final location
                        if (tempFile.renameTo(file)) {
                            Log.i("GeekDS", "Download completed: $filename (${totalBytes} bytes)")

                            // Double-check the final file
                            if (file.exists() && file.length() == totalBytes && file.canRead()) {
                                callback(true)
                            } else {
                                Log.e("GeekDS", "Download verification failed: $filename")
                                file.delete() // Clean up corrupt file
                                callback(false)
                            }
                        } else {
                            Log.e("GeekDS", "Failed to move temp file: $filename")
                            tempFile.delete()
                            callback(false)
                        }
                    } else {
                        Log.e("GeekDS", "Download produced empty file: $filename")
                        tempFile.delete()
                        callback(false)
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error saving file: $filename", e)
                    // Clean up any partial files
                    file.delete()
                    File(file.parent, "${filename}.tmp").delete()
                    callback(false)
                }
            }
        })
    }

    private fun downloadMedia(filename: String) {
        val file = File(getExternalFilesDir(null), filename)
        if (file.exists()) return // Already downloaded

        // URL encode the filename to handle spaces and special characters
        val encodedFilename = java.net.URLEncoder.encode(filename, "UTF-8").replace("+", "%20")

        val req = Request.Builder()
            .url("$cmsUrl/api/media/$encodedFilename")
            .get()
            .build()
        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                setState(State.ERROR, "Download failed: $filename $e")
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    setState(State.ERROR, "Download failed: $filename ${response.code}")
                    return
                }
                val sink = FileOutputStream(file)
                response.body?.byteStream()?.copyTo(sink)
                sink.close()
                Log.i("GeekDS", "Downloaded $filename")
            }
        })
    }

    // Play a downloaded video file using ExoPlayer (Media3)
    private fun playMedia(filename: String) {
        val file = File(getExternalFilesDir(null), filename)
        Log.i("GeekDS", "Checking file: ${file.absolutePath}")
        Log.i("GeekDS", "File exists: ${file.exists()}")
        Log.i("GeekDS", "File size: ${if (file.exists()) file.length() else "N/A"}")

        if (!file.exists()) {
            setState(State.ERROR, "File not found: $filename")
            return
        }
        runOnUiThread {
            try {
                val playerView = PlayerView(this).apply {
                    useController = false // Hide controls
                }
                setContentView(playerView)
                val player = ExoPlayer.Builder(this).build()
                playerView.player = player

                // Add error listener (Media3)
                player.addListener(object : androidx.media3.common.Player.Listener {
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e("GeekDS", "ExoPlayer error: ${error.message}")
                        setState(State.ERROR, "Playback error: ${error.message}")
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        Log.i("GeekDS", "Playback state changed: $playbackState")
                    }
                })

                val mediaItem = MediaItem.fromUri(file.toURI().toString())
                player.setMediaItem(mediaItem)
                player.prepare()
                player.play()
                Log.i("GeekDS", "Playing $filename")
                setState(State.IDLE, "Playing $filename")
            } catch (e: Exception) {
                Log.e("GeekDS", "Error setting up ExoPlayer: ${e.message}")
                setState(State.ERROR, "ExoPlayer setup failed: ${e.message}")
            }
        }
    }

    private fun pollCommands() {
        val id = deviceId ?: return

        val req = Request.Builder()
            .url("$cmsUrl/api/devices/$id/commands/poll")
            .get()
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Silent fail - command polling is not critical
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) return

                try {
                    val resp = response.body?.string() ?: return
                    val obj = JSONObject(resp)
                    val commands = obj.getJSONArray("commands")

                    for (i in 0 until commands.length()) {
                        val command = commands.getJSONObject(i)
                        val type = command.getString("type")

                        when (type) {
                            "screenshot_request" -> {
                                Log.i("GeekDS", "Received screenshot request via polling")
                                takeScreenshot()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w("GeekDS", "Error processing commands: $e")
                }
            }
        })
    }

    private fun debugScheduleInfo() {
        val schedule = loadSchedule(this)
        val playlist = loadPlaylist(this)
        val now = ZonedDateTime.now(ZoneId.of("UTC"))
        val currentDay = now.dayOfWeek.name.lowercase()
        val currentTime = now.format(DateTimeFormatter.ofPattern("HH:mm"))

        Log.d("GeekDS", "=== SCHEDULE DEBUG INFO ===")
        Log.d("GeekDS", "Current time: ${now.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)}")
        Log.d("GeekDS", "Current day: $currentDay")
        Log.d("GeekDS", "Current time slot: $currentTime")

        if (schedule != null) {
            Log.d("GeekDS", "Schedule Info:")
            Log.d("GeekDS", "  Name: ${schedule.name ?: "unnamed"}")
            Log.d("GeekDS", "  Time slot: ${schedule.timeSlotStart} - ${schedule.timeSlotEnd}")
            Log.d("GeekDS", "  Days: ${schedule.daysOfWeek.joinToString(", ")}")
            Log.d("GeekDS", "  Valid from: ${schedule.validFrom ?: "no start date"}")
            Log.d("GeekDS", "  Valid until: ${schedule.validUntil ?: "no end date"}")
            Log.d("GeekDS", "  Enabled: ${schedule.isEnabled}")
            Log.d("GeekDS", "  Playlist ID: ${schedule.playlistId}")

            // Calculate current status
            val inTimeSlot = currentTime in schedule.timeSlotStart..schedule.timeSlotEnd
            val onActiveDay = schedule.daysOfWeek.contains(currentDay)
            fun parseDebugDate(dateStr: String?): LocalDate? {
                if (dateStr == null) return null
                return try {
                    ZonedDateTime.parse(dateStr).toLocalDate()
                } catch (e: Exception) {
                    try {
                        LocalDate.parse(dateStr)
                    } catch (e: Exception) {
                        null
                    }
                }
            }

            val validFromDate = parseDebugDate(schedule.validFrom)
            val validUntilDate = parseDebugDate(schedule.validUntil)
            val withinValidPeriod = (validFromDate == null || !now.toLocalDate().isBefore(validFromDate)) &&
                    (validUntilDate == null || !now.toLocalDate().isAfter(validUntilDate))

            Log.d("GeekDS", "Schedule Status:")
            Log.d("GeekDS", "  In time slot: $inTimeSlot")
            Log.d("GeekDS", "  On active day: $onActiveDay")
            Log.d("GeekDS", "  Within valid period: $withinValidPeriod")
            Log.d("GeekDS", "  Should be active: ${schedule.isEnabled && inTimeSlot && onActiveDay && withinValidPeriod}")
        } else {
            Log.d("GeekDS", "No schedule loaded")
        }

        if (playlist != null) {
            Log.d("GeekDS", "Playlist Info:")
            Log.d("GeekDS", "  ID: ${playlist.id}")
            Log.d("GeekDS", "  Files: ${playlist.mediaFiles.size}")
            playlist.mediaFiles.forEachIndexed { index, file ->
                val localFile = File(getExternalFilesDir(null), file.filename)
                Log.d("GeekDS", "  [$index] ${file.filename}")
                Log.d("GeekDS", "    - exists: ${localFile.exists()}")
                Log.d("GeekDS", "    - size: ${localFile.length()}")
                Log.d("GeekDS", "    - type: ${file.type}")
                Log.d("GeekDS", "    - duration: ${file.duration}s")
            }
        } else {
            Log.d("GeekDS", "No playlist loaded")
        }

        // Add playback status
        Log.d("GeekDS", "Playback Status:")
        Log.d("GeekDS", "  Active: $isPlaylistActive")
        Log.d("GeekDS", "  Current playlist: $currentPlaylistId")
        Log.d("GeekDS", "  Player initialized: ${player != null}")

        Log.d("GeekDS", "=== END DEBUG INFO ===")
    }

    // NEW: Smart multi-schedule enforcement for offline schedule switching
    private fun enforceScheduleWithMultiple(schedules: List<Schedule>) {
        // Get current time in UTC
        val now = ZonedDateTime.now(ZoneId.of("UTC"))
        val currentDay = now.dayOfWeek.name.lowercase()
        val currentTime = now.format(DateTimeFormatter.ofPattern("HH:mm"))

        Log.d("GeekDS", "=== MULTI-SCHEDULE CHECK ===")
        Log.d("GeekDS", "Current UTC: $currentDay $currentTime")
        Log.d("GeekDS", "Checking ${schedules.size} cached schedules")

        fun timeToMinutes(timeStr: String): Int {
            val parts = timeStr.split(":")
            if (parts.size < 2) return 0
            return (parts[0].toIntOrNull() ?: 0) * 60 + (parts[1].toIntOrNull() ?: 0)
        }

        val currentMinutes = timeToMinutes(currentTime)

        // DEBUG: Log all schedules
        schedules.forEachIndexed { index, sched ->
            Log.d("GeekDS", "Schedule[$index]: '${sched.name}' playlist=${sched.playlistId}")
            Log.d("GeekDS", "  Days: ${sched.daysOfWeek.joinToString(",")}")
            Log.d("GeekDS", "  Time: ${sched.timeSlotStart}-${sched.timeSlotEnd}")
            Log.d("GeekDS", "  Valid: ${sched.validFrom} to ${sched.validUntil}")
            Log.d("GeekDS", "  Enabled: ${sched.isEnabled}")
        }

        // Find the active schedule for RIGHT NOW
        val activeSchedule = schedules.find { schedule ->
            Log.d("GeekDS", "Checking schedule '${schedule.name}':")

            if (!schedule.isEnabled) {
                Log.d("GeekDS", "  ❌ Disabled")
                return@find false
            }

            // Check day of week
            if (!schedule.daysOfWeek.contains(currentDay)) {
                Log.d("GeekDS", "  ❌ Wrong day (need ${schedule.daysOfWeek.joinToString(",")}, today is $currentDay)")
                return@find false
            }
            Log.d("GeekDS", "  ✅ Day matches")

            // Check validity period
            fun parseValidityDate(dateStr: String?): LocalDate? {
                if (dateStr.isNullOrBlank() || dateStr.equals("null", ignoreCase = true)) return null
                return try {
                    ZonedDateTime.parse(dateStr).toLocalDate()
                } catch (e: Exception) {
                    try {
                        LocalDate.parse(dateStr)
                    } catch (e: Exception) {
                        null
                    }
                }
            }

            val validFrom = parseValidityDate(schedule.validFrom)
            val validUntil = parseValidityDate(schedule.validUntil)

            if (validFrom != null && now.toLocalDate().isBefore(validFrom)) {
                Log.d("GeekDS", "  ❌ Before valid period (starts $validFrom)")
                return@find false
            }
            if (validUntil != null && now.toLocalDate().isAfter(validUntil)) {
                Log.d("GeekDS", "  ❌ After valid period (ended $validUntil)")
                return@find false
            }
            Log.d("GeekDS", "  ✅ Valid period OK")

            // Check time slot
            val startMinutes = timeToMinutes(schedule.timeSlotStart)
            val endMinutes = timeToMinutes(schedule.timeSlotEnd)

            val inTimeSlot = currentMinutes in startMinutes..endMinutes
            Log.d("GeekDS", "  Time check: current=$currentMinutes, range=$startMinutes-$endMinutes")
            if (!inTimeSlot) {
                Log.d("GeekDS", "  ❌ Outside time window")
                return@find false
            }

            Log.d("GeekDS", "  ✅✅✅ ACTIVE SCHEDULE FOUND!")
            true
        }

        if (activeSchedule != null) {
            Log.i("GeekDS", "MULTI-SCHEDULE: Active='${activeSchedule.name}' playlist=${activeSchedule.playlistId}")

            // Save as current schedule
            saveSchedule(this, activeSchedule)

            // Check if we need to switch playlists
            val needsSwitch = !isPlaylistActive || currentPlaylistId != activeSchedule.playlistId

            if (needsSwitch) {
                currentPlaylistId = activeSchedule.playlistId

                // Try to load cached playlist first
                val cachedPlaylist = loadPlaylistById(this, activeSchedule.playlistId)
                if (cachedPlaylist != null) {
                    Log.i("GeekDS", "*** STARTING/SWITCHING TO CACHED PLAYLIST ${activeSchedule.playlistId} ***")
                    savePlaylist(this, cachedPlaylist) // Set as current
                    isPlaylistActive = true
                    runOnUiThread {
                        startPlaylistPlayback(cachedPlaylist)
                    }
                } else {
                    Log.w("GeekDS", "Playlist ${activeSchedule.playlistId} not cached, fetching from server...")
                    fetchPlaylist(activeSchedule.playlistId)
                }
            }
        } else {
            Log.i("GeekDS", "MULTI-SCHEDULE: No active schedule for current time window")
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - no active schedule")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
        }
    }

    // Enhanced schedule enforcement with new schedule format
    private fun enforceSchedule() {
        // FIRST: Try to use multi-schedule enforcement if we have cached schedules
        val allSchedules = loadAllSchedules(this)

        if (allSchedules != null && allSchedules.isNotEmpty()) {
            Log.i("GeekDS", "=========================================")
            Log.i("GeekDS", "ENFORCE: Found ${allSchedules.size} cached schedules, using multi-schedule mode")
            Log.i("GeekDS", "ENFORCE: isPlaylistActive=$isPlaylistActive, currentPlaylistId=$currentPlaylistId")
            Log.i("GeekDS", "=========================================")
            // Use smart multi-schedule enforcement for offline switching
            enforceScheduleWithMultiple(allSchedules)
            return
        } else {
            Log.w("GeekDS", "enforceSchedule: No cached schedules found (allSchedules=${allSchedules?.size ?: "null"}), falling back to single schedule")
        }

        // FALLBACK: Use old single-schedule logic
        val schedule = loadSchedule(this) ?: run {
            // Only log once per minute to avoid spam
            val now = System.currentTimeMillis()
            if (now - lastScheduleLogTime > 60000L) {
                Log.w("GeekDS", "enforceSchedule: No schedule loaded")
                lastScheduleLogTime = now
            }

            // If no schedule, ensure playback is stopped
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - no schedule available")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }

        val playlist = loadPlaylist(this) ?: run {
            // Only log once per minute to avoid spam
            val now = System.currentTimeMillis()
            if (now - lastPlaylistLogTime > 60000L) {
                Log.w("GeekDS", "enforceSchedule: No playlist loaded")
                lastPlaylistLogTime = now
            }

            // If no playlist, ensure playback is stopped
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - no playlist available")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }

        // If schedule is disabled, stop playback and return
        if (!schedule.isEnabled) {
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - schedule is disabled")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }

        // Get current time components in UTC
        val now = ZonedDateTime.now(ZoneId.of("UTC"))
        val currentDay = now.dayOfWeek.name.lowercase()
        val currentTime = now.format(DateTimeFormatter.ofPattern("HH:mm"))

        // Check if current day is in schedule
        if (!schedule.daysOfWeek.contains(currentDay)) {
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - not scheduled for today")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }

        // Check validity period
        fun parseValidityDate(isoString: String?): LocalDate? {
            // Treat null, "null", or blank as no limit (always valid)
            if (isoString == null || isoString.trim().isEmpty() || isoString.equals("null", ignoreCase = true)) return null
            return try {
                // First try parsing as full ISO datetime
                ZonedDateTime.parse(isoString).toLocalDate()
            } catch (e: Exception) {
                try {
                    // Then try date-only
                    LocalDate.parse(isoString)
                } catch (e: Exception) {
                    Log.e("GeekDS", "Failed to parse validity date: $isoString", e)
                    null
                }
            }
        }

        val validFromDate = parseValidityDate(schedule.validFrom)
        val validUntilDate = parseValidityDate(schedule.validUntil)

        if (validFromDate != null && now.toLocalDate().isBefore(validFromDate)) {
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - before valid period")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }
        if (validUntilDate != null && now.toLocalDate().isAfter(validUntilDate)) {
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - after valid period")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread { showStandby() }
            }
            return
        }

        // Convert HH:mm time to minutes since midnight for proper comparison
        fun timeToMinutes(timeStr: String): Int {
            val parts = timeStr.split(":")
            if (parts.size < 2) return 0
            val hours = parts[0].toIntOrNull() ?: 0
            val minutes = parts[1].toIntOrNull() ?: 0
            return hours * 60 + minutes // ignore seconds if present
        }

        val currentMinutes = timeToMinutes(currentTime)
        val startMinutes = timeToMinutes(schedule.timeSlotStart)
        val endMinutes = timeToMinutes(schedule.timeSlotEnd)
        val inTimeSlot = currentMinutes in startMinutes..endMinutes

        // Log status every minute
        if (now.second == 0) {
            Log.d("GeekDS", "Schedule check: day=$currentDay, time=$currentTime (${currentMinutes}m)")
            Log.d("GeekDS", "Time slot: ${schedule.timeSlotStart}-${schedule.timeSlotEnd} (${startMinutes}m-${endMinutes}m)")
            Log.d("GeekDS", "In time slot: $inTimeSlot")
        }

        if (inTimeSlot) {
            // Only start/restart playback if not already active with the same playlist
            if (!isPlaylistActive) {
                Log.i("GeekDS", "*** STARTING PLAYBACK *** playlist=${playlist.id}, files=${playlist.mediaFiles.size}")
                isPlaylistActive = true
                currentPlaylistId = playlist.id
                runOnUiThread {
                    startPlaylistPlayback(playlist)
                }
            } else if (currentPlaylistId != playlist.id) {
                Log.i("GeekDS", "*** SWITCHING PLAYLIST *** from $currentPlaylistId to ${playlist.id}")
                currentPlaylistId = playlist.id
                runOnUiThread {
                    startPlaylistPlayback(playlist)
                }
            } else {
                // Playlist is already active and it's the same playlist - do nothing
                // This prevents unnecessary restarts during periodic schedule checks
            }
        } else {
            // Outside time slot
            if (isPlaylistActive) {
                Log.i("GeekDS", "*** STOPPING PLAYBACK *** - outside time slot")
                isPlaylistActive = false
                currentPlaylistId = null
                runOnUiThread {
                    showStandby()
                }
            }
        }
    }


    // Add a method to manually trigger playback for testing
    private fun testPlayback() {
        Log.i("GeekDS", "=== MANUAL PLAYBACK TEST ===")
        debugScheduleInfo()

        val playlist = loadPlaylist(this)
        if (playlist != null) {
            Log.i("GeekDS", "Forcing playback start for testing...")
            isPlaylistActive = true
            currentPlaylistId = playlist.id
            startPlaylistPlayback(playlist)
        } else {
            Log.e("GeekDS", "Cannot test - no playlist loaded")
        }
    }

    // Enhanced startPlaylistPlayback method
    private fun startPlaylistPlayback(playlist: Playlist) {
        Log.i("GeekDS", ">>> startPlaylistPlayback called with ${playlist.mediaFiles.size} items")

        try {
            // Check if all files exist locally and are complete
            val availableFiles = playlist.mediaFiles.filter { mediaFile ->
                val file = File(getExternalFilesDir(null), mediaFile.filename)
                val exists = file.exists()
                val size = if (exists) file.length() else 0
                val canRead = if (exists) file.canRead() else false

                Log.i("GeekDS", "File check: ${mediaFile.filename}, exists=$exists, size=$size, canRead=$canRead, path=${file.absolutePath}")

                // File must exist, have content, and be readable
                exists && size > 0 && canRead
            }

            Log.i("GeekDS", "Available files: ${availableFiles.size}/${playlist.mediaFiles.size}")

            if (availableFiles.isEmpty()) {
                Log.e("GeekDS", "*** NO MEDIA FILES AVAILABLE - SHOWING STANDBY ***")
                setState(State.ERROR, "No media files available")
                isPlaylistActive = false
                showStandby()
                return
            }

            // If not all files are ready, wait for downloads to complete
            if (availableFiles.size < playlist.mediaFiles.size) {
                Log.w("GeekDS", "Not all files ready (${availableFiles.size}/${playlist.mediaFiles.size}) - waiting for downloads")
                setState(State.SYNCING, "Waiting for file downloads...")
                return
            }

            runOnUiThread {
                // Clear the container and hide standby
                rootContainer?.removeAllViews()
                standbyImageView = null

                // Release previous player if exists
                player?.let {
                    Log.i("GeekDS", "Releasing previous player")
                    it.stop()
                    it.release()
                }

                // Create new player and view
                Log.i("GeekDS", "Creating new ExoPlayer")
                player = ExoPlayer.Builder(this@MainActivity).build()

                Log.i("GeekDS", "Creating new PlayerView")
                playerView = PlayerView(this@MainActivity).apply {
                    useController = false
                    // IMPORTANT: For screenshot compatibility, we'll handle this in layout
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }

                // Create TextureView and set it on the player directly
                Log.i("GeekDS", "Creating TextureView for video rendering")
                videoTextureView = TextureView(this@MainActivity)

                // Set the TextureView on the player itself - correct method for TextureView
                player?.setVideoTextureView(videoTextureView)

                // Set player to the PlayerView
                playerView?.player = player

                Log.i("GeekDS", "Adding PlayerView to container")
                rootContainer?.addView(playerView)

                // Build MediaItem list from available files only
                val mediaItems = availableFiles.map { mediaFile ->
                    val file = File(getExternalFilesDir(null), mediaFile.filename)

                    // Use Android Uri.fromFile() instead of file.toURI().toString() for better compatibility
                    val uri = android.net.Uri.fromFile(file)
                    Log.i("GeekDS", "Adding MediaItem: $uri (file size: ${file.length()})")
                    MediaItem.fromUri(uri)
                }

                Log.i("GeekDS", "Setting ${mediaItems.size} media items to player")
                player?.setMediaItems(mediaItems)
                player?.repeatMode = androidx.media3.common.Player.REPEAT_MODE_ALL
                player?.shuffleModeEnabled = false

                // Enhanced listener for debugging
                player?.addListener(object : androidx.media3.common.Player.Listener {
                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        Log.e("GeekDS", "*** EXOPLAYER ERROR - FALLING BACK TO STANDBY ***")
                        Log.e("GeekDS", "Error type: ${error.errorCode}")
                        Log.e("GeekDS", "Error message: ${error.message}")
                        Log.e("GeekDS", "Cause: ${error.cause}")
                        error.printStackTrace()
                        setState(State.ERROR, "Playback error: ${error.message}")
                        isPlaylistActive = false
                        showStandby() // Show standby on error
                    }

                    override fun onPlaybackStateChanged(playbackState: Int) {
                        val stateStr = when(playbackState) {
                            androidx.media3.common.Player.STATE_IDLE -> "IDLE"
                            androidx.media3.common.Player.STATE_BUFFERING -> "BUFFERING"
                            androidx.media3.common.Player.STATE_READY -> "READY"
                            androidx.media3.common.Player.STATE_ENDED -> "ENDED"
                            else -> "UNKNOWN($playbackState)"
                        }
                        Log.i("GeekDS", "*** PLAYBACK STATE: $stateStr ***")

                        if (playbackState == androidx.media3.common.Player.STATE_READY) {
                            setState(State.IDLE, "Playing playlist ${currentPlaylistId}")
                            Log.i("GeekDS", "*** PLAYBACK READY - SHOULD BE PLAYING NOW ***")
                        } else if (playbackState == androidx.media3.common.Player.STATE_ENDED) {
                            Log.i("GeekDS", "*** PLAYBACK ENDED - SHOWING STANDBY ***")
                            showStandby()
                        }
                    }

                    override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
                        val reasonStr = when(reason) {
                            androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "AUTO"
                            androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "REPEAT"
                            androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "SEEK"
                            androidx.media3.common.Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED -> "PLAYLIST_CHANGED"
                            else -> "UNKNOWN($reason)"
                        }
                        Log.i("GeekDS", "*** MEDIA TRANSITION *** ${mediaItem?.localConfiguration?.uri} (reason: $reasonStr)")
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        Log.i("GeekDS", "*** IS PLAYING CHANGED: $isPlaying ***")
                    }
                })

                Log.i("GeekDS", "Calling player.prepare()")
                player?.prepare()

                Log.i("GeekDS", "Calling player.play()")
                player?.play()

                Log.i("GeekDS", "*** PLAYBACK SETUP COMPLETE ***")
            }

        } catch (e: Exception) {
            Log.e("GeekDS", "*** EXCEPTION in startPlaylistPlayback ***", e)
            setState(State.ERROR, "Failed to start playback: ${e.message}")
            isPlaylistActive = false
            showStandby() // Show standby on exception
        }
    }

    private fun playPlaylist(playlist: Playlist) {
        Log.d("GeekDS", ">>> ENTER playPlaylist with ${playlist.mediaFiles.size} items")
        try {
            playlist.mediaFiles.forEach {
                val file = File(getExternalFilesDir(null), it.filename)
                Log.d(
                    "GeekDS",
                    "Playlist item: ${it.filename}, exists=${file.exists()}, path=${file.absolutePath}"
                )
            }
            if (playlist.mediaFiles.isEmpty()) {
                Log.w("GeekDS", "Playlist is empty, showing standby")
                showStandby()
                return
            }
            // Release previous player if exists
            player?.release()
            Log.d("GeekDS", "Released previous player")

            // Create new player and view if needed
            player = ExoPlayer.Builder(this).build()
            playerView = PlayerView(this).apply {
                useController = false
                player = this@MainActivity.player
            }
            setContentView(playerView)
            Log.d("GeekDS", "Set up player and playerView")

            // Build MediaItem list from all media files
            val mediaItems = playlist.mediaFiles.map {
                MediaItem.fromUri(File(getExternalFilesDir(null), it.filename).toURI().toString())
            }
            Log.d(
                "GeekDS",
                "Built mediaItems list: ${mediaItems.map { it.localConfiguration?.uri }}"
            )
            player?.setMediaItems(mediaItems)
            player?.repeatMode = androidx.media3.common.Player.REPEAT_MODE_ALL
            player?.shuffleModeEnabled = true // Set to false if you want ordered playback

            // Add error listener
            player?.addListener(object : androidx.media3.common.Player.Listener {
                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    Log.e("GeekDS", "ExoPlayer error: ${error.message}")
                    setState(State.ERROR, "Playback error: ${error.message}")
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    Log.i("GeekDS", "Playback state changed: $playbackState")
                }
            })

            player?.prepare()
            Log.d("GeekDS", "Called player?.prepare()")
            player?.play()
            Log.d("GeekDS", "Called player?.play()")
        } catch (e: Exception) {
            Log.e("GeekDS", "Exception in playPlaylist", e)
        }
    }
    private fun loadExternalConfig(): JSONObject? {
        return try {
            // Load from app's external files directory
            val configFile = File(getExternalFilesDir(null), "config.json")
            Log.i("GeekDS", "Checking config at: ${configFile.absolutePath}")
            Log.i("GeekDS", "File exists: ${configFile.exists()}, canRead: ${configFile.canRead()}")

            if (configFile.exists() && configFile.canRead()) {
                val content = configFile.readText()
                Log.i("GeekDS", "Loaded config from: ${configFile.absolutePath}")
                JSONObject(content)
            } else {
                Log.w("GeekDS", "Config file not found at: ${configFile.absolutePath}")
                null
            }
        } catch (e: Exception) {
            Log.e("GeekDS", "Error reading config: ${e.message}")
            null
        }
    }

    // Stub for standby screen
    // Enhanced showStandby method with image support
    private fun showStandby() {
        Log.d("GeekDS", "Showing standby screen with image")

        // Release and clean up player
        player?.let {
            it.stop()
            it.release()
        }
        player = null
        playerView = null

        runOnUiThread {
            // Clear the container
            rootContainer?.removeAllViews()

            // Create and configure standby image view
            standbyImageView = ImageView(this).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                scaleType = ImageView.ScaleType.CENTER_CROP // or CENTER_INSIDE, FIT_CENTER depending on your preference
                setBackgroundColor(Color.BLACK)

                // Set the standby image from drawable resources
                // You need to add your standby image to res/drawable/ folder
                try {
                    setImageResource(R.drawable.standby_image) // Replace with your actual image name
                } catch (e: Exception) {
                    Log.e("GeekDS", "Failed to load standby image", e)
                    // Fallback to a colored background if image fails to load
                    setBackgroundColor(Color.parseColor("#1a1a1a")) // Dark gray
                }
            }

            // Add standby image to container
            rootContainer?.addView(standbyImageView)

            // Optionally add status text overlay (uncomment if needed)
            /*
            val statusOverlay = TextView(this).apply {
                text = "STANDBY - No scheduled content"
                setTextColor(Color.WHITE)
                textSize = 24f
                gravity = Gravity.CENTER
                layoutParams = RelativeLayout.LayoutParams(
                    RelativeLayout.LayoutParams.MATCH_PARENT,
                    RelativeLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    addRule(RelativeLayout.CENTER_IN_PARENT)
                }
                setPadding(40, 40, 40, 40)
                setBackgroundColor(Color.parseColor("#80000000")) // Semi-transparent background
            }
            rootContainer?.addView(statusOverlay)
            */
        }

        setState(State.IDLE, "Standby mode with image")
    }

// Data models

    data class Schedule(
        val playlistId: Int,
        val name: String?,
        val daysOfWeek: List<String>,
        val timeSlotStart: String,     // HH:mm format
        val timeSlotEnd: String,       // HH:mm format
        val validFrom: String?,        // YYYY-MM-DD format
        val validUntil: String?,       // YYYY-MM-DD format
        val isEnabled: Boolean
    )

    data class Playlist(
        val id: Int,
        val mediaFiles: List<MediaFile>
    )

    data class MediaFile(
        val filename: String,
        val duration: Int, // seconds
        val type: String
    )

// Local storage helpers

    fun saveSchedule(context: Context, schedule: Schedule) {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("schedule", Gson().toJson(schedule)).apply()
    }

    fun loadSchedule(context: Context): Schedule? {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("schedule", null) ?: return null
        return Gson().fromJson(json, Schedule::class.java)
    }

    // Save all schedules for offline schedule switching
    fun saveAllSchedules(context: Context, schedules: List<Schedule>) {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("all_schedules", Gson().toJson(schedules)).apply()
        Log.i("GeekDS", "Saved ${schedules.size} schedules for offline use")
    }

    // Load all cached schedules
    fun loadAllSchedules(context: Context): List<Schedule>? {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("all_schedules", null) ?: return null
        return try {
            val type = object : com.google.gson.reflect.TypeToken<List<Schedule>>() {}.type
            Gson().fromJson<List<Schedule>>(json, type)
        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to load all schedules", e)
            null
        }
    }

    fun savePlaylist(context: Context, playlist: Playlist) {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("playlist", Gson().toJson(playlist)).apply()
    }

    fun loadPlaylist(context: Context): Playlist? {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("playlist", null) ?: return null
        return Gson().fromJson(json, Playlist::class.java)
    }

    // Save playlist by ID for caching multiple playlists
    fun savePlaylistById(context: Context, playlistId: Int, playlist: Playlist) {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("playlist_$playlistId", Gson().toJson(playlist)).apply()
        Log.i("GeekDS", "Saved playlist $playlistId with ${playlist.mediaFiles.size} files")
    }

    fun loadPlaylistById(context: Context, playlistId: Int): Playlist? {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("playlist_$playlistId", null) ?: return null
        return try {
            Gson().fromJson(json, Playlist::class.java)
        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to load playlist $playlistId", e)
            null
        }
    }

    // WebSocket connection management
    // Screenshot functionality - Enhanced to capture video content
    private fun takeScreenshot() {
        Log.d("GeekDS", "Taking screenshot...")

        // Run on UI thread to access views properly
        runOnUiThread {
            try {
                // Get the root view
                val rootView = when {
                    rootContainer != null -> rootContainer!!
                    window?.decorView?.rootView != null -> window.decorView.rootView
                    else -> {
                        Log.e("GeekDS", "No root view available for screenshot")
                        return@runOnUiThread
                    }
                }

                Log.d("GeekDS", "Root view dimensions: ${rootView.width}x${rootView.height}")

                // Ensure the view is laid out and has valid dimensions
                if (rootView.width <= 0 || rootView.height <= 0) {
                    Log.e("GeekDS", "Root view has invalid dimensions")
                    return@runOnUiThread
                }

                // Smart ExoPlayer detection: Check if player is active and has content
                val currentPlayerView = playerView
                val isExoPlayerActive = isExoPlayerActiveWithContent()

                Log.d("GeekDS", "ExoPlayer active with content: $isExoPlayerActive")

                if (isExoPlayerActive && currentPlayerView != null) {
                    // For active ExoPlayer, try to extract current/last frame
                    Log.d("GeekDS", "Using ExoPlayer frame extraction method")
                    captureExoPlayerFrame(currentPlayerView, rootView)
                } else {
                    // For standby mode or inactive player, use regular view drawing
                    Log.d("GeekDS", "Using traditional screenshot method")
                    captureRegularScreenshot(rootView)
                }

            } catch (e: Exception) {
                Log.e("GeekDS", "Error taking screenshot", e)
            }
        }
    }

    // Smart detection of ExoPlayer state
    private fun isExoPlayerActiveWithContent(): Boolean {
        val currentPlayer = player ?: return false

        return try {
            // Check if player has content loaded
            val hasContent = currentPlayer.mediaItemCount > 0

            // Check player state - consider READY, BUFFERING, or ENDED as "active with content"
            val playbackState = currentPlayer.playbackState
            val isActiveState = playbackState == androidx.media3.common.Player.STATE_READY ||
                    playbackState == androidx.media3.common.Player.STATE_BUFFERING ||
                    playbackState == androidx.media3.common.Player.STATE_ENDED

            // Check if currently playing or was recently playing (paused but has content)
            val isPlaying = currentPlayer.isPlaying
            val hasPlayedContent = currentPlayer.contentPosition > 0 || currentPlayer.currentPosition > 0

            val isActive = hasContent && isActiveState && (isPlaying || hasPlayedContent)

            Log.d("GeekDS", "ExoPlayer state - hasContent: $hasContent, state: $playbackState, isPlaying: $isPlaying, hasPlayedContent: $hasPlayedContent, result: $isActive")

            isActive
        } catch (e: Exception) {
            Log.w("GeekDS", "Error checking ExoPlayer state: ${e.message}")
            false
        }
    }

    private fun captureRegularScreenshot(rootView: View) {
        try {
            // Create bitmap for regular screenshot
            val bitmap = Bitmap.createBitmap(
                rootView.width,
                rootView.height,
                Bitmap.Config.ARGB_8888
            )

            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.BLACK)
            rootView.draw(canvas)

            Log.d("GeekDS", "Regular screenshot captured: ${bitmap.width}x${bitmap.height}")

            uploadProcessedScreenshot(bitmap)

        } catch (e: Exception) {
            Log.e("GeekDS", "Error in regular screenshot", e)
        }
    }

    private fun captureExoPlayerFrame(playerView: PlayerView, rootView: View) {
        try {
            Log.d("GeekDS", "Attempting ExoPlayer frame extraction...")

            // Method 1: Use our stored TextureView reference (most reliable for current frame)
            if (videoTextureView != null && videoTextureView!!.isAvailable) {
                Log.d("GeekDS", "Extracting frame from stored TextureView reference")
                val videoBitmap = videoTextureView!!.getBitmap()
                if (videoBitmap != null && !videoBitmap.isRecycled && videoBitmap.width > 1 && videoBitmap.height > 1) {
                    Log.d("GeekDS", "SUCCESS: ExoPlayer frame extracted from stored TextureView: ${videoBitmap.width}x${videoBitmap.height}")
                    uploadProcessedScreenshot(videoBitmap)
                    return
                } else {
                    Log.d("GeekDS", "Stored TextureView bitmap was null or invalid")
                }
            } else {
                Log.d("GeekDS", "Stored TextureView is null or not available")
            }

            // Method 2: Get current frame from PlayerView's video surface
            val videoSurfaceView = playerView.videoSurfaceView
            if (videoSurfaceView is TextureView && videoSurfaceView.isAvailable) {
                Log.d("GeekDS", "Extracting frame from PlayerView TextureView")
                val videoBitmap = videoSurfaceView.getBitmap()
                if (videoBitmap != null && !videoBitmap.isRecycled && videoBitmap.width > 1 && videoBitmap.height > 1) {
                    Log.d("GeekDS", "SUCCESS: ExoPlayer frame extracted from PlayerView TextureView: ${videoBitmap.width}x${videoBitmap.height}")
                    uploadProcessedScreenshot(videoBitmap)
                    return
                } else {
                    Log.d("GeekDS", "PlayerView TextureView bitmap was null or invalid")
                }
            } else {
                Log.d("GeekDS", "PlayerView videoSurfaceView is not TextureView or not available: ${videoSurfaceView?.javaClass?.simpleName}")
            }

            // Method 3: Search for TextureView in PlayerView hierarchy (for current frame)
            val foundTextureView = findTextureViewRecursive(playerView)
            if (foundTextureView != null && foundTextureView.isAvailable) {
                Log.d("GeekDS", "Extracting frame from found TextureView in hierarchy")
                val videoBitmap = foundTextureView.getBitmap()
                if (videoBitmap != null && !videoBitmap.isRecycled && videoBitmap.width > 1 && videoBitmap.height > 1) {
                    Log.d("GeekDS", "SUCCESS: ExoPlayer frame extracted from found TextureView: ${videoBitmap.width}x${videoBitmap.height}")
                    uploadProcessedScreenshot(videoBitmap)
                    return
                }
            }

            // Method 4: Try to get frame from ExoPlayer using MediaMetadataRetriever approach
            if (tryExtractFrameFromExoPlayer()) {
                return // Success handled in the method
            }

            Log.w("GeekDS", "All ExoPlayer frame extraction methods failed, falling back to traditional screenshot")
            // Fallback: Use traditional screenshot as last resort
            captureRegularScreenshot(rootView)

        } catch (e: Exception) {
            Log.e("GeekDS", "Error in ExoPlayer frame extraction, falling back to regular screenshot", e)
            captureRegularScreenshot(rootView)
        }
    }

    // Method to extract frame from ExoPlayer using current media file
    private fun tryExtractFrameFromExoPlayer(): Boolean {
        return try {
            val currentPlayer = player ?: return false
            val currentMediaItem = currentPlayer.currentMediaItem ?: return false

            // Get the current media URI
            val mediaUri = currentMediaItem.localConfiguration?.uri
            if (mediaUri == null) {
                Log.d("GeekDS", "No media URI available for frame extraction")
                return false
            }

            Log.d("GeekDS", "Attempting frame extraction from media URI: $mediaUri")

            // Use MediaMetadataRetriever to get frame at current position
            val retriever = MediaMetadataRetriever()

            retriever.setDataSource(this, mediaUri)

            // Get current playback position in microseconds
            val currentPositionMs = currentPlayer.currentPosition
            val currentPositionUs = currentPositionMs * 1000L

            Log.d("GeekDS", "Extracting frame at position: ${currentPositionMs}ms")

            // Get frame at current position
            val frameBitmap = retriever.getFrameAtTime(currentPositionUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)

            retriever.release()

            if (frameBitmap != null && !frameBitmap.isRecycled && frameBitmap.width > 1 && frameBitmap.height > 1) {
                Log.d("GeekDS", "SUCCESS: Frame extracted from ExoPlayer media: ${frameBitmap.width}x${frameBitmap.height}")
                uploadProcessedScreenshot(frameBitmap)
                return true
            } else {
                Log.d("GeekDS", "MediaMetadataRetriever returned null or invalid bitmap")
                return false
            }

        } catch (e: Exception) {
            Log.w("GeekDS", "MediaMetadataRetriever frame extraction failed: ${e.message}")
            false
        }
    }

    private fun captureViewAsBitmap(view: View): Bitmap? {
        return try {
            if (view.width <= 0 || view.height <= 0) return null

            val bitmap = Bitmap.createBitmap(
                view.width,
                view.height,
                Bitmap.Config.ARGB_8888
            )
            val canvas = Canvas(bitmap)
            view.draw(canvas)
            bitmap
        } catch (e: Exception) {
            Log.e("GeekDS", "Error capturing view as bitmap", e)
            null
        }
    }

    private fun findVideoSurface(viewGroup: View): View? {
        if (viewGroup is TextureView || viewGroup is SurfaceView) {
            return viewGroup
        }

        if (viewGroup is ViewGroup) {
            for (i in 0 until viewGroup.childCount) {
                val child = viewGroup.getChildAt(i)
                val result = findVideoSurface(child)
                if (result != null) return result
            }
        }

        return null
    }

    private fun findTextureViewRecursive(viewGroup: View?): TextureView? {
        if (viewGroup is TextureView) {
            return viewGroup
        }

        if (viewGroup is ViewGroup) {
            for (i in 0 until viewGroup.childCount) {
                val child = viewGroup.getChildAt(i)
                val result = findTextureViewRecursive(child)
                if (result != null) return result
            }
        }

        return null
    }

    private fun uploadProcessedScreenshot(bitmap: Bitmap) {
        // Scale down to reasonable size for upload
        val maxWidth = 1280
        val maxHeight = 720

        val scaledBitmap = if (bitmap.width > maxWidth || bitmap.height > maxHeight) {
            val scale = min(
                maxWidth.toFloat() / bitmap.width,
                maxHeight.toFloat() / bitmap.height
            )
            val newWidth = (bitmap.width * scale).toInt()
            val newHeight = (bitmap.height * scale).toInt()

            Log.d("GeekDS", "Scaling bitmap from ${bitmap.width}x${bitmap.height} to ${newWidth}x${newHeight}")
            Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
        } else {
            bitmap
        }

        // Upload in background thread
        scope.launch(Dispatchers.IO) {
            uploadScreenshot(scaledBitmap)

            // Clean up bitmaps
            if (scaledBitmap != bitmap) {
                bitmap.recycle()
            }
            scaledBitmap.recycle()
        }
    }

    private fun uploadScreenshot(bitmap: Bitmap) {
        try {
            Log.d("GeekDS", "Starting screenshot upload, bitmap: ${bitmap.width}x${bitmap.height}")

            // Convert bitmap to byte array with better compression
            val outputStream = ByteArrayOutputStream()

            // Use JPEG for better compression, quality 85 for good balance
            val compressed = bitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)

            if (!compressed) {
                Log.e("GeekDS", "Failed to compress bitmap to JPEG")
                return
            }

            val imageBytes = outputStream.toByteArray()
            outputStream.close()

            Log.d("GeekDS", "Screenshot compressed: ${imageBytes.size / 1024}KB")

            if (imageBytes.isEmpty()) {
                Log.e("GeekDS", "Screenshot bytes are empty after compression!")
                return
            }

            if (imageBytes.size < 1000) {
                Log.w("GeekDS", "Screenshot suspiciously small: ${imageBytes.size} bytes")
            }

            // Create multipart request
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "screenshot",
                    "screenshot_${System.currentTimeMillis()}.jpg",
                    RequestBody.create("image/jpeg".toMediaTypeOrNull(), imageBytes)
                )
                .build()

            val request = Request.Builder()
                .url("$cmsUrl/api/devices/$deviceId/screenshot/upload")
                .post(requestBody)
                .build()

            Log.d("GeekDS", "Sending screenshot upload request...")

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Log.e("GeekDS", "Failed to upload screenshot", e)
                }

                override fun onResponse(call: Call, response: Response) {
                    val responseBody = response.body?.string()

                    if (response.isSuccessful) {
                        Log.i("GeekDS", "Screenshot uploaded successfully: $responseBody")
                    } else {
                        Log.e("GeekDS", "Failed to upload screenshot: ${response.code} - $responseBody")
                    }
                }
            })

        } catch (e: Exception) {
            Log.e("GeekDS", "Error in uploadScreenshot", e)
        }
    }
}
