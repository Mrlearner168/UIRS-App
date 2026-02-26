package com.rogerskie09.uirsv4

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    private val TAG = "FCM_DEBUG"
    private val FALLBACK_CHANNEL_ID = "critical_fallback_channel"
    private val UPDATE_CHANNEL_ID = "general_updates"

    // 🛑 SHARED ID: Used for both Service and Fallback so they replace each other
    companion object {
        const val EMERGENCY_NOTIFICATION_ID = 999
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "✅ MyFirebaseMessagingService Service Created/Started")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "🔥 NEW FCM TOKEN GENERATED: $token")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // 1. FAIL-SAFE LOGGING
        Log.d(TAG, "🔥 Message Received from: ${remoteMessage.from}")

        if (remoteMessage.data.isEmpty()) {
            Log.e(TAG, "❌ Payload is empty!")
            return
        }

        // 2. WakeLock: Grab CPU immediately to prevent Samsung from killing the app mid-logic
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "UIRS:FCMProcessingLock"
        )
        // Hold for 10 seconds max to process logic
        wakeLock.acquire(10000L)

        try {
            val type = remoteMessage.data["type"] ?: "update"
            val title = remoteMessage.data["title"] ?: "New Notification"
            val body = remoteMessage.data["body"] ?: "Check the app for details"

            if (type == "emergency") {
                // 🛑 NEW DEDUPLICATION LOGIC 🛑
                val incidentId = remoteMessage.data["incident_id"] ?: remoteMessage.data["id"]
                val decision = EventDeduplicator.checkIncident(incidentId)

                when (decision) {
                    EventDeduplicator.Decision.LAUNCH_NEW -> {
                        Log.d(TAG, "✅ Fresh FCM Alert! Starting Sequence for ID: $incidentId")
                        processEmergencyFCM(title, body, remoteMessage.data, isReinforcement = false)
                    }
                    
                    EventDeduplicator.Decision.REINFORCE -> {
                        Log.d(TAG, "📢 REINFORCE: Signal backup for ID: $incidentId (Socket likely already arrived)")
                        processEmergencyFCM(title, body, remoteMessage.data, isReinforcement = true)
                    }
                    
                    EventDeduplicator.Decision.IGNORE -> {
                        Log.w(TAG, "🚫 Duplicate FCM Alert blocked. (Handled within last 30s)")
                    }
                }
                // 🛑 END DEDUPLICATION LOGIC 🛑

            } else {
                sendUpdateNotification(title, body, remoteMessage.data)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ CRASH in onMessageReceived: ${e.message}")
            e.printStackTrace()
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }
    /**
     * Prepares data and triggers the Emergency Service.
     */
    private fun processEmergencyFCM(
        title: String, 
        body: String, 
        data: Map<String, String>, 
        isReinforcement: Boolean
    ) {
        // We convert the map to a MutableMap so we can inject our reinforcement flag
        val updatedData = data.toMutableMap()
        updatedData["is_reinforcement"] = isReinforcement.toString()

        // Call your existing robust starter with the new flag
        attemptToStartEmergencyService(title, body, updatedData, 0)
    }

    // 🛑 ROBUST SERVICE STARTER WITH RETRY LOGIC 🛑
    private fun attemptToStartEmergencyService(
        title: String, 
        body: String, 
        data: Map<String, String>, 
        retryCount: Int
    ) {
        val serviceIntent = Intent(this, EmergencyAlertService::class.java).apply {
            putExtra("title", title)
            putExtra("body", body)
            for ((key, value) in data) putExtra(key, value)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        try {
            Log.d(TAG, "⚡ Attempting startForegroundService... (Attempt ${retryCount + 1}/3)")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Service Start Failed: ${e.message}")

            // 🔄 RETRY LOGIC 🔄
            // If we haven't tried 3 times yet, wait a bit and try again.
            if (retryCount < 3) {
                Log.w(TAG, "⏳ Retrying to wake service in 500ms...")
                try {
                    Thread.sleep(500) // Brief pause to let system recover
                } catch (interrupted: InterruptedException) {
                    // Ignore
                }
                // Recursive call with incremented counter
                attemptToStartEmergencyService(title, body, data, retryCount + 1)
            } else {
                // 🛑 FINAL FAILURE -> Trigger Fallback 🛑
                Log.e(TAG, "💀 All retries failed. Triggering Fallback Notification.")
                sendFallbackNotification(title, body, data)
            }
        }
    }

    // 🛑 FALLBACK MECHANISM (With Stop Button) 🛑
    private fun sendFallbackNotification(title: String, body: String, data: Map<String, String>) {
        try {
            // Check Permission (Android 13+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Create Fallback Channel
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    FALLBACK_CHANNEL_ID, "Critical Alerts (Fallback)", NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    enableVibration(true)
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                notificationManager.createNotificationChannel(channel)
            }

            // 1. Content Intent (Open App)
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("navigate_to", "responder_dashboard")
                for ((key, value) in data) putExtra(key, value)
            }
            
            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )

            // 2. STOP Intent (Trigger the separate Receiver file)
            val stopIntent = Intent(this, NotificationActionReceiver::class.java).apply {
                putExtra("notification_id", EMERGENCY_NOTIFICATION_ID)
            }
            val stopPendingIntent = PendingIntent.getBroadcast(
                this,
                1,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 3. Build Notification
            val notification = NotificationCompat.Builder(this, FALLBACK_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("⚠️ $title")
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true) 
                .setOngoing(true)
                .setVibrate(longArrayOf(0, 500, 200, 500, 200, 500))
                
                // Add the STOP Button
                .addAction(android.R.drawable.ic_delete, "STOP ALERT", stopPendingIntent)
                
                .build()

            // Notify using the FIXED ID (999)
            notificationManager.notify(EMERGENCY_NOTIFICATION_ID, notification) 
            Log.d(TAG, "✅ Fallback Notification Posted")
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Fallback Failed: ${e.message}")
        }
    }

    private fun sendUpdateNotification(title: String, body: String, data: Map<String, String>) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "❌ Missing POST_NOTIFICATIONS permission.")
                    return
                }
            }

            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UIRS:UpdateWakeLock"
            )
            wakeLock.acquire(3000)

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    UPDATE_CHANNEL_ID, "Updates", NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "General Incident Updates"
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 500, 200, 500)
                    setSound(soundUri, AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build())
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setShowBadge(true)
                }
                notificationManager.createNotificationChannel(channel)
            }
            
            val intent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                for ((key, value) in data) putExtra(key, value)
            }

            val pendingIntent = PendingIntent.getActivity(
                this, System.currentTimeMillis().toInt(), intent, PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, UPDATE_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher) 
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSound(soundUri)
                .setVibrate(longArrayOf(0, 500, 200, 500))
                .setContentIntent(pendingIntent) 
                .setAutoCancel(true)
                .build()

            notificationManager.notify(System.currentTimeMillis().toInt(), notification)
            Log.d(TAG, "ℹ️ Update Notification Posted")
        } catch (e: Exception) {
            Log.e(TAG, "❌ ERROR posting update notification: ${e.message}")
            e.printStackTrace()
        }
    }
}