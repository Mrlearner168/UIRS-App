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
    private val EMERGENCY_CHANNEL_ID = "critical_alerts"
    private val UPDATE_CHANNEL_ID = "general_updates"
    
    // Fixed ID to prevent stacking
    private val EMERGENCY_NOTIFICATION_ID = 911 

    // --- Log when Service is created to verify Manifest registration ---
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "✅ MyFirebaseMessagingService Service Created/Started")
    }

    // --- Log when a new Token is generated (Proof of Connection) ---
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "🔥 NEW FCM TOKEN GENERATED: $token")
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        // 1. FAIL-SAFE LOGGING
        Log.d(TAG, "🔥 Message Received from: ${remoteMessage.from}")
        Log.d(TAG, "📦 Full Data Payload: ${remoteMessage.data}")

        if (remoteMessage.data.isEmpty()) {
            Log.e(TAG, "❌ Payload is empty!")
            return
        }

        try {
            val type = remoteMessage.data["type"] ?: "update"
            val title = remoteMessage.data["title"] ?: "New Notification"
            val body = remoteMessage.data["body"] ?: "Check the app for details"

            if (type == "emergency") {
                sendEmergencyNotification(title, body, remoteMessage.data)
            } else {
                sendUpdateNotification(title, body, remoteMessage.data)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ CRASH in onMessageReceived: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun sendEmergencyNotification(title: String, body: String, data: Map<String, String>) {
        try {
            // 1. Check Permission (Android 13+) to prevent silent failures
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "❌ Missing POST_NOTIFICATIONS permission. Cannot display emergency alert.")
                    return
                }
            }

            // 2. Wake Lock (10 seconds)
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "UIRS:EmergencyWakeLock"
            )
            wakeLock.acquire(10 * 1000L) 

            // 3. Channel Setup with Audio Attributes (Bypass Media Volume)
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Define Sound
                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                
                // Define Audio Attributes (Usage ALARM is critical for breaking through Do Not Disturb)
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()

                val channel = NotificationChannel(
                    EMERGENCY_CHANNEL_ID,
                    "Emergency Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Emergency Alerts"
                    setBypassDnd(true)
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000) // Longer vibration
                    setSound(soundUri, audioAttributes) // Apply the alarm attributes
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setShowBadge(true)
                }
                notificationManager.createNotificationChannel(channel)
            }

            // 4. Intent Setup
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("navigate_to", "responder_dashboard")
                putExtra("is_emergency", true)
                for ((key, value) in data) {
                    putExtra(key, value)
                }
            }
            
            val fullScreenIntent = PendingIntent.getActivity(
                this, 
                EMERGENCY_NOTIFICATION_ID, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 5. Notification Build
            val notification = NotificationCompat.Builder(this, EMERGENCY_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher) 
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setFullScreenIntent(fullScreenIntent, true) 
                .setOngoing(true) 
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(false)
                .setVibrate(longArrayOf(0, 1000, 500, 1000, 500, 1000))
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                .build()

            notificationManager.notify(EMERGENCY_NOTIFICATION_ID, notification)
            Log.d(TAG, "🚀 EMERGENCY NOTIFICATION POSTED")

        } catch (e: Exception) {
            Log.e(TAG, "❌ ERROR posting emergency notification: ${e.message}")
            e.printStackTrace()
        }
    }

    private fun sendUpdateNotification(title: String, body: String, data: Map<String, String>) {
        try {
            // Check permissions here too
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    Log.e(TAG, "❌ Missing POST_NOTIFICATIONS permission. Cannot display update.")
                    return
                }
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    UPDATE_CHANNEL_ID, "Updates", NotificationManager.IMPORTANCE_DEFAULT
                )
                notificationManager.createNotificationChannel(channel)
            }
            
            val intent = Intent(this, MainActivity::class.java)
            for ((key, value) in data) {
                intent.putExtra(key, value)
            }

            val pendingIntent = PendingIntent.getActivity(
                this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, UPDATE_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher) 
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
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