package com.example.geekds

import android.app.Activity
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
import android.content.Context
import kotlinx.coroutines.*
import kotlin.concurrent.fixedRateTimer

class MainActivity : Activity() {
    private val cmsUrl = "http://192.168.28.147:5000" // Use LAN IP for backend
    private var deviceId: Int? = null
    private val client = OkHttpClient()
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var statusView: TextView

    // State machine
    private enum class State { REGISTERING, IDLE, SYNCING, ERROR }
    private var state: State = State.REGISTERING

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var scheduleEnforcerJob: Job? = null

    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null

    private var lastPlayedPlaylistId: Int? = null
    private var lastScheduleWindow: Pair<Long, Long>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        statusView = TextView(this)
        statusView.text = "Starting..."
        setContentView(statusView)

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
        scope.cancel()
        scheduleEnforcerJob?.cancel()
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
        val json = JSONObject()
        json.put("name", "Emulator TV Box")
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
                setState(State.ERROR, "Registration failed: $e")
                retryLater { registerDevice() }
            }
            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    setState(State.ERROR, "Registration failed: ${response.code}")
                    retryLater { registerDevice() }
                    return
                }
                val resp = response.body?.string()
                val obj = JSONObject(resp)
                deviceId = obj.getInt("id")
                saveDeviceId(deviceId!!)
                setState(State.IDLE, "Registered as device $deviceId")
                startBackgroundTasks() // Start background tasks after registration
            }
        })
    }

    private fun startBackgroundTasks() {
        // Heartbeat every 2 minutes
        scope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(2 * 60 * 1000L)
            }
        }
        // Schedule/playlist sync every 15 minutes
        scope.launch {
            while (isActive) {
                syncScheduleAndMedia()
                delay(15 * 60 * 1000L)
            }
        }
        // Command polling every 30 seconds
        scope.launch {
            while (isActive) {
                pollCommands()
                delay(30 * 1000L)
            }
        }
        // Schedule enforcement: check every second
        scheduleEnforcerJob = scope.launch {
            while (isActive) {
                enforceSchedule()
                delay(1000L)
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

    private fun sendHeartbeat() {
        val id = deviceId ?: return
        val json = JSONObject()
        json.put("status", "online")
        json.put("current_media", "none")
        json.put("system_info", JSONObject().apply {
            put("cpu", 10)
            put("memory", 30)
            put("disk", "2GB")
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
                setState(State.ERROR, "Heartbeat failed: $e")
            }
            override fun onResponse(call: Call, response: Response) {
                if (!response.isSuccessful) {
                    setState(State.ERROR, "Heartbeat failed: ${response.code}")
                } else {
                    setState(State.IDLE, "Heartbeat sent for device $id")
                }
            }
        })
    }

    private fun syncScheduleAndMedia() {
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
                val resp = response.body?.string()
                val arr = JSONArray(resp)
                val mySchedules = (0 until arr.length())
                    .map { arr.getJSONObject(it) }
                    .filter { it.getInt("device_id") == id }
                if (mySchedules.isNotEmpty()) {
                    val sched = mySchedules[0]
                    val playlistId = sched.getInt("playlist_id")
                    val startTimeStr = sched.getString("start_time")
                    val endTimeStr = sched.getString("end_time")
                    val startTime = parseIso8601ToMillis(startTimeStr)
                    val endTime = parseIso8601ToMillis(endTimeStr)
                    val schedule = Schedule(
                        playlistId = playlistId,
                        startTime = startTime,
                        endTime = endTime
                    )
                    saveSchedule(this@MainActivity, schedule)
                    fetchPlaylist(playlistId)
                } else {
                    setState(State.IDLE, "No schedule assigned")
                    // Remove local schedule and playlist
                    val prefs = getSharedPreferences("geekds_prefs", MODE_PRIVATE)
                    prefs.edit().remove("schedule").remove("playlist").apply()
                }
            }
        })
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
                } catch (_: Exception) {}
            }
            0L
        } catch (e: Exception) {
            Log.e("GeekDS", "Failed to parse date: $iso", e)
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
                val mediaFilesJson = obj.getJSONArray("media_files")
                val mediaFiles = mutableListOf<MediaFile>()
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
                val playlist = Playlist(id = playlistId, mediaFiles = mediaFiles)
                savePlaylist(this@MainActivity, playlist)
                setState(State.IDLE, "Media synced. Ready to play!")
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

    // Enforce schedule: play playlist if in window, else standby
    private fun enforceSchedule() {
        val schedule = loadSchedule(this) ?: run {
            Log.w("GeekDS", "No schedule loaded")
            return
        }
        val playlist = loadPlaylist(this) ?: run {
            Log.w("GeekDS", "No playlist loaded")
            return
        }
        val now = System.currentTimeMillis()
        Log.d("GeekDS", "Enforcer: now=$now, schedule=(${schedule.startTime}..${schedule.endTime}), playlist size=${playlist.mediaFiles.size}")
        Log.d("GeekDS", "lastPlayedPlaylistId=$lastPlayedPlaylistId, lastScheduleWindow=$lastScheduleWindow, player=$player")

        if (now in schedule.startTime..schedule.endTime) {
            val scheduleWindow = schedule.startTime to schedule.endTime
            // TEMP: Always call playPlaylist for diagnosis
            Log.d("GeekDS", "[FORCE] Calling playPlaylist: lastPlayedPlaylistId=$lastPlayedPlaylistId, playlist.id=${playlist.id}, lastScheduleWindow=$lastScheduleWindow, scheduleWindow=$scheduleWindow, player=$player")
            lastPlayedPlaylistId = playlist.id
            lastScheduleWindow = scheduleWindow
            runOnUiThread { playPlaylist(playlist) }
            // Uncomment below and remove above for production:
            // if (lastPlayedPlaylistId != playlist.id || lastScheduleWindow != scheduleWindow || player == null) {
            //     Log.d("GeekDS", "Calling playPlaylist: lastPlayedPlaylistId=$lastPlayedPlaylistId, playlist.id=${playlist.id}, lastScheduleWindow=$lastScheduleWindow, scheduleWindow=$scheduleWindow, player=$player")
            //     lastPlayedPlaylistId = playlist.id
            //     lastScheduleWindow = scheduleWindow
            //     runOnUiThread { playPlaylist(playlist) }
            // }
        } else {
            lastPlayedPlaylistId = null
            lastScheduleWindow = null
            runOnUiThread { showStandby() }
        }
    }

    private fun playPlaylist(playlist: Playlist) {
        Log.d("GeekDS", ">>> ENTER playPlaylist with ${playlist.mediaFiles.size} items")
        try {
            playlist.mediaFiles.forEach {
                val file = File(getExternalFilesDir(null), it.filename)
                Log.d("GeekDS", "Playlist item: ${it.filename}, exists=${file.exists()}, path=${file.absolutePath}")
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
            Log.d("GeekDS", "Built mediaItems list: ${mediaItems.map { it.localConfiguration?.uri }}")
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

    // Stub for standby screen
    private fun showStandby() {
        statusView.text = "[STANDBY] No scheduled playback."
        setContentView(statusView)
    }
} 

// Data models

data class Schedule(
    val playlistId: Int,
    val startTime: Long, // epoch millis
    val endTime: Long    // epoch millis
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