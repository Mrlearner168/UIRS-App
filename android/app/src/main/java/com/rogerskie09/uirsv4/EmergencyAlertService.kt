package com.rogerskie09.uirsv4

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.hardware.camera2.CameraManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.*
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class EmergencyAlertService : Service() {

    private val TAG = "EmergencyService_DEBUG"
    private val CHANNEL_ID = "EMERGENCY_ALERT_CHANNEL_V2" 

    // Hardware & Media
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var audioManager: AudioManager? = null
    private lateinit var cameraManager: CameraManager
    private var wakeLock: PowerManager.WakeLock? = null

    // State
    private var cameraId: String? = null
    private var isFlashOn = false
    private var isAlertActive = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var initialVolume: Int = 0 // To restore volume later if needed

    // Config
    private val MAX_DURATION_MS = 5 * 60 * 1000L 

    // --- FLASHING RUNNABLE ---
    private val flashLightRunnable = object : Runnable {
        override fun run() {
            if (!isAlertActive) return

            try {
                if (toggleFlashlight()) {
                    mainHandler.postDelayed(this, 500) // 500ms strobe
                } else {
                    // If failed (camera busy), wait longer before retrying to avoid CPU spike
                    mainHandler.postDelayed(this, 2000)
                }
            } catch (e: Exception) {
                Log.e(TAG, "⚠️ Flash loop error: ${e.message}")
            }
        }
    }

    private val stopRunnable = Runnable {
        Log.d(TAG, "⏰ Auto-stop timer triggered.")
        stopEmergency()
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "🚀 Service onCreate called")

        try {
            // 1. Acquire Partial WakeLock (Keeps CPU running even if screen off)
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "UIRS:EmergencyWakeLock"
            )
            wakeLock?.acquire(10 * 60 * 1000L) // 10 mins timeout

            // 2. Setup Hardware
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            cameraManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
            audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

            // 3. Find Flash Camera
            cameraId = cameraManager.cameraIdList.firstOrNull { id ->
                val characteristics = cameraManager.getCameraCharacteristics(id)
                characteristics.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ CRASH in onCreate: ${e.message}")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "▶️ onStartCommand executed")

        // Handle STOP action
        if (intent?.action == "STOP_SERVICE") {
            Log.d(TAG, "🛑 Received Stop Action")
            stopEmergency()
            return START_NOT_STICKY
        }

        val title = intent?.getStringExtra("title") ?: "EMERGENCY ALERT"
        val body = intent?.getStringExtra("body") ?: "Immediate attention required"

        // 🛑 NEW: Check if this is a backup signal (from FCM or Socket)
        val isReinforcement = intent?.getStringExtra("is_reinforcement")?.toBoolean() ?: false

        // 1. START FOREGROUND IMMEDIATELY (Crucial for Android 12+)
        val notificationStarted = startForegroundNotification(title, body, intent)
        if (!notificationStarted) {
            Log.e(TAG, "💀 Fatal: Foreground start failed. Stopping service to prevent crash.")
            stopSelf()
            return START_NOT_STICKY
        }

        // 2. FORCE LAUNCH ACTIVITY (The Fix for Android 10/11/12/13/14)
        // This attempts to open the screen even if the phone is unlocked/in use
        forceLaunchActivity(intent)

        // 3. Start Logic
        if (!isAlertActive) {
            Log.d(TAG, "🔥 Starting Hardware Alert (Siren/Vibe/Flash)")
            isAlertActive = true
            
            // Steal Focus & Max Volume
            prepareAudioSession()
            
            playAlarmSound()
            startVibration()

            // Flashlight Logic
            if (cameraId != null && ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                mainHandler.post(flashLightRunnable)
            }

            // Schedule Auto-Stop
            mainHandler.postDelayed(stopRunnable, MAX_DURATION_MS)
            
        } else if (isReinforcement) {
            // 🛑 NEW: Do nothing here! 
            // The activity and notification refreshed above, but we skip restarting the hardware.
            Log.d(TAG, "📢 Reinforcement signal received. Hardware already active, skipping audio restart.")
        }

        return START_STICKY
    }

    /**
     * ✅ NEW METHOD: Forces the Activity to open using Overlay Permission.
     * Required for Android 10+ to bypass background start restrictions.
     */
    private fun forceLaunchActivity(originalIntent: Intent?) {
        val activityIntent = Intent(this, EmergencyAlertActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or 
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_NO_USER_ACTION or
                    Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            
            originalIntent?.extras?.let { putExtras(it) }
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+: Check for Overlay Permission
                if (Settings.canDrawOverlays(this)) {
                    Log.d(TAG, "⚡ Overlay Granted. Forcing Activity Launch...")
                    startActivity(activityIntent)
                } else {
                    Log.w(TAG, "⚠️ No Overlay Permission. Notification Banner only.")
                }
            } else {
                // Android 9 and below: Just launch it
                startActivity(activityIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Force launch failed: ${e.message}")
        }
    }

    // 🛑 ROBUST AUDIO HANDLING 🛑
    private fun prepareAudioSession() {
        try {
            // 1. Force Max Volume
            val maxVolume = audioManager?.getStreamMaxVolume(AudioManager.STREAM_ALARM) ?: 1
            initialVolume = audioManager?.getStreamVolume(AudioManager.STREAM_ALARM) ?: 5
            audioManager?.setStreamVolume(AudioManager.STREAM_ALARM, maxVolume, 0)

            // 2. Request Audio Focus (Mutes Spotify/YouTube)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    .build()
                audioManager?.requestAudioFocus(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager?.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            }
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ Audio Focus/Volume failed: ${e.message}")
        }
    }

    private fun startForegroundNotification(title: String, body: String, originalIntent: Intent?): Boolean {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Emergency Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Critical Emergency Alerts"
                    enableLights(true)
                    lightColor = Color.RED
                    enableVibration(true)
                    setBypassDnd(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(null, null) // We play custom sound manually
                }
                notificationManager.createNotificationChannel(channel)
            }

            // 1. Full Screen Intent (Opens Activity on Lock Screen)
            val fullScreenIntent = Intent(this, EmergencyAlertActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or 
                        Intent.FLAG_ACTIVITY_NO_USER_ACTION
                
                originalIntent?.extras?.let { putExtras(it) }
                putExtra("title", title)
                putExtra("body", body)
            }

            val fullScreenPendingIntent = PendingIntent.getActivity(
                this, 100, fullScreenIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 2. Stop Action
            val stopIntent = Intent(this, EmergencyAlertService::class.java).apply { action = "STOP_SERVICE" }
            val stopPendingIntent = PendingIntent.getService(
                this, 101, stopIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // 3. Build Notification
            val notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher) 
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullScreenPendingIntent, true) // <-- WAKES SCREEN (If allowed)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "STOP ALERT", stopPendingIntent)
                .setOngoing(true)
                .setAutoCancel(false)
                .build()

            // 4. ANDROID 10+ / 14+ COMPATIBILITY
            // 🚨 We only use MEDIA_PLAYBACK to keep the service alive for the siren.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    999, 
                    notification, 
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                )
            } else {
                startForeground(999, notification)
            }
            
            Log.d(TAG, "✅ Foreground Notification Started successfully")
            return true

        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to build notification: ${e.message}")
            
            // 🛑 SAFETY NET: Satisfy Android's "Foreground Promise" to prevent crash
            try {
                val fallbackNotification = NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("Emergency Alert")
                    .setContentText("Critical alert in progress. Tap to open.")
                    .setSmallIcon(android.R.drawable.ic_dialog_alert) // Safe system icon
                    .build()
                
                // Fixed Fallback: Must ALSO include the service type for Android 10+
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(999, fallbackNotification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                } else {
                    startForeground(999, fallbackNotification)
                }
            } catch (e2: Exception) {
                Log.e(TAG, "❌ Even Fallback failed: ${e2.message}")
            }
            
            return false
        }
    }

    private fun playAlarmSound() {
        try {
            mediaPlayer?.release()
            
            val soundUri = android.net.Uri.parse("android.resource://$packageName/${R.raw.emergency_siren}")
            
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@EmergencyAlertService, soundUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Custom Sound Failed, trying system default.")
            playSystemDefaultAlarm() 
        }
    }

    private fun playSystemDefaultAlarm() {
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@EmergencyAlertService, alarmUri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) { Log.e(TAG, "❌ System Sound Failed: ${e.message}") }
    }

    private fun startVibration() {
        try {
            // Aggressive pattern: Vibrate 500ms, Pause 200ms
            val pattern = longArrayOf(0, 500, 200)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) { }
    }

    private fun toggleFlashlight(): Boolean {
        val id = cameraId ?: return false
        
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                isFlashOn = !isFlashOn
                cameraManager.setTorchMode(id, isFlashOn)
                true
            } else {
                false
            }
        } catch (e: android.hardware.camera2.CameraAccessException) {
            // This happens normally if the user has the Camera app open, or during a video call.
            Log.w(TAG, "⚠️ Camera hardware busy. Cannot toggle flash right now.")
            isFlashOn = false 
            false
        } catch (e: Exception) {
            // Catching any other weird system crashes
            Log.e(TAG, "❌ Unexpected Flashlight error: ${e.message}")
            isFlashOn = false 
            false
        }
    }

    private fun stopEmergency() {
        Log.d(TAG, "🛑 Stopping Emergency Service Logic...")
        
        isAlertActive = false
        mainHandler.removeCallbacksAndMessages(null)

        // 1. Stop Audio
        try {
            if (mediaPlayer?.isPlaying == true) mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) { }

        // 2. Stop Vibration
        try {
            vibrator?.cancel()
        } catch (e: Exception) { }

        // 3. Stop Flash
        try {
            if (isFlashOn && cameraId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                cameraManager.setTorchMode(cameraId!!, false)
            }
        } catch (e: Exception) { }

        // 4. Abandon Audio Focus (Let music play again)
        try {
             if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).build()
                audioManager?.abandonAudioFocusRequest(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(null)
            }
        } catch(e: Exception) {}

        // 5. Release CPU Lock
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (e: Exception) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        stopEmergency()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}