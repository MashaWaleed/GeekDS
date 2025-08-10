package com.example.geekds

import android.app.Activity
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
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
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
import java.time.ZonedDateTime
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.text.SimpleDateFormat
import android.content.BroadcastReceiver
import android.content.Context
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
    private var deviceName: String = "GeekDS Device" // Default fallback
    private var cmsUrl: String = "http://192.168.1.10:5000" // Default fallback
    private var deviceId: Int? = null

    // Enhanced OkHttpClient with longer timeouts and retry
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
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
    private var connectionFailureCount = 0
    private var isNetworkAvailable = false
    private var isRetryInProgress = false
    private val retryLock = Any()


    // State machine
    private enum class State { REGISTERING, IDLE, SYNCING, ERROR }

    private var state: State = State.REGISTERING

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var scheduleEnforcerJob: Job? = null

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null

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
                    cmsUrl = url
                    Log.i("GeekDS", "Loaded server URL from config: $cmsUrl")
                }
            }
        } ?: run {
            Log.w("GeekDS", "No external config found, using defaults: name='$deviceName', url='$cmsUrl'")
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
        if (deviceId != null) {
            setState(State.IDLE, "Loaded device $deviceId")
            startBackgroundTasks()
        } else {
            setState(State.REGISTERING, "Registering device...")
            registerDevice()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
        standbyImageView = null
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
                    
                    // Don't immediately reset failure count - let normal operations handle it
                    // connectionFailureCount = 0
                    lastSuccessfulConnection = System.currentTimeMillis()

                    // Restart background tasks when network comes back - but with delay and coordination
                    handler.postDelayed({
                        synchronized(retryLock) {
                            if (deviceId != null && !isRetryInProgress) {
                                Log.i("GeekDS", "Network restored - attempting sync")
                                syncScheduleAndMedia()
                            }
                        }
                    }, 5000) // Wait 5 seconds for network to stabilize
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

    // Enhanced connection checking
    private fun isNetworkConnected(): Boolean {
        return try {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false

            networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            Log.e("GeekDS", "Error checking network connection", e)
            false
        }
    }

    // Enhanced error handling with proper coordination
    private var lastRecoveryAttempt = 0L
    private val RECOVERY_COOLDOWN = 300_000L // 5 minutes between recovery attempts
    private var isRetryInProgress = false
    private val retryLock = Any()

    private fun handleConnectionError(operation: String, error: Throwable) {
        synchronized(retryLock) {
            // Prevent multiple retry operations from interfering
            if (isRetryInProgress) {
                Log.w("GeekDS", "Retry already in progress for $operation, skipping")
                return
            }

            connectionFailureCount++
            val timeSinceLastSuccess = System.currentTimeMillis() - lastSuccessfulConnection

            Log.e("GeekDS", "Connection error in $operation (failure #$connectionFailureCount): $error")
            Log.e("GeekDS", "Time since last successful connection: ${timeSinceLastSuccess / 1000}s")

            setState(State.ERROR, "$operation failed (attempt $connectionFailureCount)")

            // Only attempt recovery if failures are significant and enough time has passed
            val now = System.currentTimeMillis()
            if (connectionFailureCount >= 10 && (now - lastRecoveryAttempt) > RECOVERY_COOLDOWN) {
                Log.w("GeekDS", "*** ATTEMPTING CONNECTION RECOVERY ***")
                lastRecoveryAttempt = now
                attemptConnectionRecovery()
                return // Don't schedule individual retry
            }

            // Progressive backoff with maximum delay of 5 minutes
            val backoffTime = minOf(60_000L * (connectionFailureCount / 3), 300_000L)
            Log.i("GeekDS", "Will retry in ${backoffTime / 1000}s")

            isRetryInProgress = true
            handler.postDelayed({
                synchronized(retryLock) {
                    isRetryInProgress = false
                    if (isNetworkConnected()) {
                        Log.i("GeekDS", "Retrying $operation after backoff")
                        when (operation) {
                            "registration" -> registerDevice()
                            "heartbeat" -> sendHeartbeat()
                            "sync" -> syncScheduleAndMedia()
                        }
                    } else {
                        Log.w("GeekDS", "Network still unavailable, skipping retry")
                    }
                }
            }, backoffTime)
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

                // Wait longer for things to settle
                delay(10000)

                // Check if we can reach the server
                if (isNetworkConnected()) {
                    Log.i("GeekDS", "Network appears available, attempting to reconnect")

                    // Reset failure count and try again - but don't reset retry state
                    connectionFailureCount = 0

                    // Re-register if needed
                    if (deviceId == null) {
                        registerDevice()
                    } else {
                        // Try a simple heartbeat first
                        sendHeartbeat()
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

    private fun registerDevice() {
        if (!isNetworkConnected()) {
            Log.w("GeekDS", "Cannot register - no network connection")
            setState(State.ERROR, "No network connection")
            retryLater { registerDevice() }
            return
        }

        val json = JSONObject()
        json.put("name", deviceName)
        val ip = getLocalIpAddress() ?: "unknown"
        json.put("ip", ip)

        val body = RequestBody.create(
            "application/json".toMediaTypeOrNull(), json.toString()
        )
        val req = Request.Builder()
            .url("$cmsUrl/api/devices")
            .post(body)
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                handleConnectionError("registration", e)
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    handleConnectionError("registration", Exception("HTTP ${response.code}"))
                    return
                }
                try {
                    val resp = response.body?.string()
                    val obj = JSONObject(resp)
                    deviceId = obj.getInt("id")
                    saveDeviceId(deviceId!!)
                    
                    // Reset retry state on successful registration
                    synchronized(retryLock) {
                        lastSuccessfulConnection = System.currentTimeMillis()
                        connectionFailureCount = 0
                        isRetryInProgress = false
                    }
                    setState(State.IDLE, "Registered as device $deviceId")
                    startBackgroundTasks()
                } catch (e: Exception) {
                    handleConnectionError("registration", e)
                }
            }
        })
    }

    // Updated startBackgroundTasks with better coordination
    private fun startBackgroundTasks() {
        // Cancel any existing jobs
        scope.coroutineContext.cancelChildren()
        scheduleEnforcerJob?.cancel()

        Log.i("GeekDS", "Starting coordinated background tasks")

        // Add initial debug info
        handler.postDelayed({
            debugScheduleInfo()
        }, 3000)

        // Heartbeat every 3 minutes with network and state checking
        scope.launch {
            while (isActive) {
                try {
                    delay(3 * 60 * 1000L) // Wait first, then check
                    synchronized(retryLock) {
                        if (isNetworkConnected() && !isRetryInProgress && state != State.ERROR) {
                            sendHeartbeat()
                        } else {
                            Log.d("GeekDS", "Skipping heartbeat - network=${isNetworkConnected()}, retrying=$isRetryInProgress, state=$state")
                        }
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error in heartbeat loop", e)
                }
            }
        }

        // Schedule/playlist sync every 2 minutes with network and state checking
        scope.launch {
            while (isActive) {
                try {
                    delay(2 * 60 * 1000L) // Wait first, then check
                    synchronized(retryLock) {
                        if (isNetworkConnected() && !isRetryInProgress && state != State.ERROR) {
                            syncScheduleAndMedia()
                        } else {
                            Log.d("GeekDS", "Skipping sync - network=${isNetworkConnected()}, retrying=$isRetryInProgress, state=$state")
                        }
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error in sync loop", e)
                }
            }
        }

        // Command polling every 60 seconds with network and state checking
        scope.launch {
            while (isActive) {
                try {
                    delay(60 * 1000L) // Wait first, then check
                    synchronized(retryLock) {
                        if (isNetworkConnected() && !isRetryInProgress && state != State.ERROR) {
                            pollCommands()
                        }
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error in command polling", e)
                }
            }
        }

        // Schedule enforcement: check every second (no network needed)
        scheduleEnforcerJob = scope.launch {
            while (isActive) {
                try {
                    enforceSchedule()
                    delay(1000L)
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error in schedule enforcement", e)
                    delay(5000L) // Wait longer on error
                }
            }
        }

        // Wake lock renewal every 10 minutes
        scope.launch {
            while (isActive) {
                try {
                    delay(10 * 60 * 1000L)
                    if (wakeLock?.isHeld != true) {
                        Log.w("GeekDS", "Wake lock lost, re-acquiring")
                        setupWakeLock()
                    }
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error in wake lock management", e)
                }
            }
        }
    }

    private val mainLoop = object : Runnable {
        override fun run() {
            when (state) {
                State.IDLE -> {
                    // No-op for IDLE, handled by coroutines
                }

                State.ERROR -> {
                    // Try to recover every 2 minutes
                    handler.postDelayed(this, 120_000)
                }

                else -> {
                    // No-op for REGISTERING or SYNCING
                }
            }
        }
    }

    private fun retryLater(action: () -> Unit) {
        handler.postDelayed({ action() }, 30_000)
    }

    // ENHANCED: Updated sendHeartbeat method to include device name and IP
    private fun sendHeartbeat() {
        val id = deviceId ?: return

        if (!isNetworkConnected()) {
            Log.w("GeekDS", "Cannot send heartbeat - no network connection")
            return
        }

        val json = JSONObject()
        json.put("status", "online")
        json.put("current_media", if (isPlaylistActive) "playing" else "standby")

        // NEW: Include device name and IP in heartbeat
        json.put("name", deviceName)
        val currentIp = getLocalIpAddress() ?: "unknown"
        json.put("ip", currentIp)

        json.put("system_info", JSONObject().apply {
            put("cpu", 10)
            put("memory", 30)
            put("disk", "2GB")
            put("network_failures", connectionFailureCount)
            put("last_success", lastSuccessfulConnection)
            put("device_name", deviceName) // Also include in system_info for redundancy
            put("current_ip", currentIp)
        })

        val body = RequestBody.create(
            "application/json".toMediaTypeOrNull(), json.toString()
        )
        val req = Request.Builder()
            .url("$cmsUrl/api/devices/$id")
            .patch(body)
            .build()

        client.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                handleConnectionError("heartbeat", e)
            }

            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    handleConnectionError("heartbeat", Exception("HTTP ${response.code}"))
                } else {
                    // Reset retry state on successful heartbeat
                    synchronized(retryLock) {
                        lastSuccessfulConnection = System.currentTimeMillis()
                        connectionFailureCount = 0
                        isRetryInProgress = false
                    }
                    setState(State.IDLE, "Heartbeat sent for device $id (name: $deviceName, ip: $currentIp)")
                    Log.d("GeekDS", "Heartbeat sent with updated device info - name: '$deviceName', ip: '$currentIp'")
                }
            }
        })
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
                    // Reset retry state on successful sync
                    synchronized(retryLock) {
                        lastSuccessfulConnection = System.currentTimeMillis()
                        connectionFailureCount = 0
                        isRetryInProgress = false
                    }

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
                                if (dateStr == null) return null
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

                                // Only update schedule timestamp now
                                lastScheduleTimestamp = scheduleTimestamp
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

                                // Store current playlist info for the fetch callback
                                val pendingPlaylistId = playlistId
                                val pendingPlaylistTimestamp = playlistTimestamp

                                // Always fetch when playlist changes or switches
                                fetchPlaylist(playlistId)
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
        prefs.edit().remove("schedule").remove("playlist").apply()
        isPlaylistActive = false
        currentPlaylistId = null
        lastScheduleTimestamp = null
        lastPlaylistTimestamp = null
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
                savePlaylist(this@MainActivity, playlist)

                // Download media and restart playback
                Log.i("GeekDS", "Starting media download for playlist $playlistId with ${mediaFiles.size} files")
                downloadPlaylistMedia(playlist)

                // If this was the currently playing playlist, restart playback
                if (isCurrentPlaylist) {
                    Log.i("GeekDS", "Restarting playback with updated playlist")
                    runOnUiThread {
                        startPlaylistPlayback(playlist)
                    }
                }

                setState(State.IDLE, "Media synced. Ready to play!")
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

        playlist.mediaFiles.forEach { mediaFile ->
            downloadMediaWithCallback(mediaFile.filename) { success ->
                downloadCount++
                if (success) {
                    Log.i("GeekDS", "Downloaded: ${mediaFile.filename}")
                } else {
                    Log.e("GeekDS", "Failed to download: ${mediaFile.filename}")
                }

                if (downloadCount == totalFiles) {
                    setState(State.IDLE, "All media files processed ($downloadCount/$totalFiles)")
                }
            }
        }
    }

    // Updated download function with callback
    private fun downloadMediaWithCallback(filename: String, callback: (Boolean) -> Unit) {
        val file = File(getExternalFilesDir(null), filename)
        if (file.exists()) {
            callback(true) // Already exists
            return
        }

        val req = Request.Builder()
            .url("$cmsUrl/api/media/$filename")
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
                    val sink = FileOutputStream(file)
                    response.body?.byteStream()?.copyTo(sink)
                    sink.close()
                    callback(true)
                } catch (e: Exception) {
                    Log.e("GeekDS", "Error saving file: $filename", e)
                    callback(false)
                }
            }
        })
    }

    private fun downloadMedia(filename: String) {
        val file = File(getExternalFilesDir(null), filename)
        if (file.exists()) return // Already downloaded

        val req = Request.Builder()
            .url("$cmsUrl/api/media/$filename")
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
                val playerView = PlayerView(this)
                playerView.useController = false // Hide controls
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
        // TODO: Implement polling for commands and executing them
        // Example: GET $cmsUrl/api/devices/$deviceId/commands
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

    // Updated enforceSchedule with better logging
    // Enhanced schedule enforcement with new schedule format
    private fun enforceSchedule() {
        val schedule = loadSchedule(this) ?: run {
            Log.w("GeekDS", "enforceSchedule: No schedule loaded")
            return
        }
        val playlist = loadPlaylist(this) ?: run {
            Log.w("GeekDS", "enforceSchedule: No playlist loaded")
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
            if (isoString == null) return null
            return try {
                // First try parsing as full ISO datetime
                val dt = ZonedDateTime.parse(isoString)
                dt.toLocalDate()
            } catch (e: Exception) {
                try {
                    // Then try parsing as simple date
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
            val (hours, minutes) = timeStr.split(":").map { it.toInt() }
            return hours * 60 + minutes
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
            // Start playback if not already active
            if (!isPlaylistActive || currentPlaylistId != playlist.id) {
                Log.i("GeekDS", "*** STARTING PLAYBACK *** playlist=${playlist.id}, files=${playlist.mediaFiles.size}")
                isPlaylistActive = true
                currentPlaylistId = playlist.id
                runOnUiThread {
                    startPlaylistPlayback(playlist)
                }
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
        Log.i("GeekDS", ">>> startPlaylistPlaybook called with ${playlist.mediaFiles.size} items")

        try {
            // Check if all files exist locally
            val availableFiles = playlist.mediaFiles.filter { mediaFile ->
                val file = File(getExternalFilesDir(null), mediaFile.filename)
                val exists = file.exists()
                val size = if (exists) file.length() else 0
                Log.i("GeekDS", "File check: ${mediaFile.filename}, exists=$exists, size=$size, path=${file.absolutePath}")
                exists && size > 0
            }

            Log.i("GeekDS", "Available files: ${availableFiles.size}/${playlist.mediaFiles.size}")

            if (availableFiles.isEmpty()) {
                Log.e("GeekDS", "*** NO MEDIA FILES AVAILABLE - SHOWING STANDBY ***")
                setState(State.ERROR, "No media files available")
                showStandby()
                return
            }

            runOnUiThread {
                // Clear the container and hide standby
                rootContainer?.removeAllViews()
                standbyImageView = null

                // Release previous player if exists
                player?.let {
                    Log.i("GeekDS", "Releasing previous player")
                    it.release()
                }

                // Create new player and view
                Log.i("GeekDS", "Creating new ExoPlayer")
                player = ExoPlayer.Builder(this@MainActivity).build()

                Log.i("GeekDS", "Creating new PlayerView")
                playerView = PlayerView(this@MainActivity).apply {
                    useController = false
                    player = this@MainActivity.player
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }

                Log.i("GeekDS", "Adding PlayerView to container")
                rootContainer?.addView(playerView)

                // Build MediaItem list from available files only
                val mediaItems = availableFiles.map { mediaFile ->
                    val file = File(getExternalFilesDir(null), mediaFile.filename)
                    val uri = file.toURI().toString()
                    Log.i("GeekDS", "Adding MediaItem: $uri")
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

    fun savePlaylist(context: Context, playlist: Playlist) {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("playlist", Gson().toJson(playlist)).apply()
    }

    fun loadPlaylist(context: Context): Playlist? {
        val prefs = context.getSharedPreferences("geekds_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("playlist", null) ?: return null
        return Gson().fromJson(json, Playlist::class.java)
    }
}

