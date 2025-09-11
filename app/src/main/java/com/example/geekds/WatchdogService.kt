package com.example.geekds

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

class WatchdogService : Service() {
    
    private val TAG = "WatchdogService"
    private val CHANNEL_ID = "WatchdogChannel"
    private val NOTIFICATION_ID = 1001
    private val CHECK_INTERVAL = 5000L // 5 seconds
    
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var checkRunnable: Runnable
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "WatchdogService created")
        createNotificationChannel()
        startForegroundService()
        startMonitoring()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "WatchdogService started")
        return START_STICKY // Restart service if killed
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "GeekDS Watchdog",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors and restarts GeekDS app"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun startForegroundService() {
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)
    }
    
    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("GeekDS Watchdog")
            .setContentText("Monitoring app status")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }
    
    private fun startMonitoring() {
        checkRunnable = object : Runnable {
            override fun run() {
                checkAppStatus()
                handler.postDelayed(this, CHECK_INTERVAL)
            }
        }
        handler.post(checkRunnable)
    }
    
    private fun checkAppStatus() {
        try {
            val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val runningApps = activityManager.runningAppProcesses
            
            var isAppRunning = false
            var isAppInForeground = false
            
            runningApps?.forEach { app ->
                if (app.processName == packageName) {
                    isAppRunning = true
                    if (app.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                        isAppInForeground = true
                    }
                }
            }
            
            if (!isAppRunning) {
                Log.w(TAG, "App is not running, attempting to restart")
                restartApp()
            } else if (!isAppInForeground) {
                Log.d(TAG, "App is running but not in foreground")
                bringAppToForeground()
            } else {
                Log.d(TAG, "App is running and in foreground")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error checking app status", e)
        }
    }
    
    private fun restartApp() {
        try {
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            startActivity(launchIntent)
            Log.d(TAG, "App restart initiated")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart app", e)
        }
    }
    
    private fun bringAppToForeground() {
        try {
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            startActivity(launchIntent)
            Log.d(TAG, "Brought app to foreground")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bring app to foreground", e)
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "WatchdogService destroyed")
        handler.removeCallbacks(checkRunnable)
        
        // Restart the service if it gets killed
        val restartIntent = Intent(this, WatchdogService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartIntent)
        } else {
            startService(restartIntent)
        }
    }
}
