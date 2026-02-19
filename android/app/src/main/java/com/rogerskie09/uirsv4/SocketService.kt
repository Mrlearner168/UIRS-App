package com.rogerskie09.uirsv4

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import android.Manifest
import android.app.PendingIntent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
// Removed unused ConcurrentHashMap import

/**
 * Robust Socket.IO Service for Emergency Alerts.
 * Features:
 * 1. Persistent Foreground Service (DATA_SYNC type).
 * 2. Smart Network Reconnection (Reconnects immediately on network switch).
 * 3. CPU/WiFi WakeLocks to prevent Doze mode from killing the connection.
 * 4. Event Deduplication to prevent double alerts.
 */
class SocketService : Service() {

    private var mSocket: Socket? = null
    // Use your actual production URL here
    private val SOCKET_URL = "https://uirs.duckdns.org" 
    private val TAG = "SocketService"
    private val CHANNEL_ID = "uirs_connection_channel"
    private val FALLBACK_CHANNEL_ID = "uirs_fallback_channel"
    private val EMERGENCY_NOTIFICATION_ID = 888
    private val NOTIFICATION_ID = 999 // Fixed ID to prevent flickering

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    
    // Store current credentials for validation logging
    private var currentStationId: String? = null
    private var currentUserId: String? = null
    
    // Track network state to force reconnects
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        
        // 1. Acquire Locks to keep the service alive
        acquireWakeLocks()

        // 2. Start the Foreground Notification IMMEDIATELY (Critical for Android 14)
        startForegroundServiceNotification()

        // 3. Register Network Callback for smart reconnection
        registerNetworkCallback()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Fetch credentials
        val sharedPref = getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
        val userId = sharedPref.getString("userId", null)
        val token = sharedPref.getString("token", null)
        val stationId = sharedPref.getString("stationId", null)

        this.currentStationId = stationId
        this.currentUserId = userId

        if (token != null && userId != null) {
            Log.d(TAG, "🚀 Starting Socket Service. User: $userId, Target Station ID: $stationId")
            connectToSocket(userId, token, stationId)
        } else {
            Log.e(TAG, "❌ Missing Credentials. Stopping Socket Service.")
            stopForeground(true)
            stopSelf()
        }

        return START_STICKY
    }

    private fun connectToSocket(userId: String, token: String, stationId: String?) {
        // If already connected, don't churn the connection
        if (mSocket != null && mSocket!!.connected()) {
            return
        }

        try {
            // Options optimized for mobile networks
            val opts = IO.Options().apply {
                forceNew = true // Force a new connection instance
                reconnection = true
                reconnectionDelay = 1000 // Start trying quickly
                reconnectionDelayMax = 5000 // Don't wait too long between retries
                timeout = 20000
                transports = arrayOf("websocket") // Force WebSocket (saves battery vs polling)
                query = "auth_token=$token&station_id=${stationId ?: ""}"
            }
            
            Log.d(TAG, "🔗 Initializing Socket connection with params: ${opts.query}")

            mSocket = IO.socket(SOCKET_URL, opts)

            mSocket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "✅ Socket Connected Successfully")
                // Join the user's specific room for targeted alerts
                mSocket?.emit("join_room", JSONObject().put("user_id", userId))
                updateNotificationStatus("Connected: Monitoring for Alerts")
            }

            mSocket?.on(Socket.EVENT_DISCONNECT) {
                Log.w(TAG, "⚠️ Socket Disconnected")
                updateNotificationStatus("Disconnected: Reconnecting...")
            }

            mSocket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e(TAG, "❌ Connection Error: ${args.firstOrNull()}")
            }

            // --- THE CRITICAL ALERT LISTENER ---
            mSocket?.on("incident_alert") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0]
                    Log.d(TAG, "⚡ SOCKET ALERT EVENT RECEIVED")
                    processEmergencyData(data)
                }
            }

            mSocket?.connect()

        } catch (e: Exception) {
            Log.e(TAG, "❌ Socket Setup Crash: ${e.message}")
        }
    }

    /**
     * Processes the incoming data, Deduplicates, and Launches the Siren.
     */
    private fun processEmergencyData(rawData: Any) {
        try {
            val json = if (rawData is String) JSONObject(rawData) else rawData as JSONObject
            
            // 1. Extract Identifiers
            val incidentId = json.optString("incident_id", json.optString("id", ""))
            val incomingStationId = json.optString("station_id", "N/A")
            
            Log.d(TAG, "📦 Processing Payload: $json")

            // 2. Deduplication check
            if (EventDeduplicator.isNewIncident(incidentId)) {
                Log.i(TAG, "✅ Deduplication Passed. Preparing to launch Emergency Service...")

                val title = "🚨 ${json.optString("type", "EMERGENCY").uppercase()} ALERT"
                val body = "Location: ${json.optString("location", "Unknown Location")}"

                // 3. Convert JSON to a Map for the attempt function
                val dataMap = mutableMapOf<String, String>()
                val keys = json.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    dataMap[key] = json.optString(key)
                }

                // 4. Trigger the Robust Starter
                attemptToStartEmergencyService(title, body, dataMap, 0)

            } else {
                Log.w(TAG, "⛔ Deduplication Failed: Duplicate Alert Ignored (ID: $incidentId)")
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error processing alert: ${e.message}")
        }
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
            Log.d(TAG, "⚡ Attempting start... (Attempt ${retryCount + 1}/3)")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Service Start Failed: ${e.message}")

            if (retryCount < 3) {
                Log.w(TAG, "⏳ Scheduling retry in 500ms...")
                // Use a Handler instead of Thread.sleep to keep the socket thread free
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    attemptToStartEmergencyService(title, body, data, retryCount + 1)
                }, 500)
            } else {
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

    // --- NETWORK HANDLING ---

    private fun registerNetworkCallback() {
        try {
            connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            networkCallback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    // Network became available. If socket is disconnected, reconnect NOW.
                    if (mSocket != null && !mSocket!!.connected()) {
                        Log.d(TAG, "Network restored. Forcing Socket reconnect.")
                        mSocket?.connect()
                    }
                }
            }
            connectivityManager.registerDefaultNetworkCallback(networkCallback!!)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register network callback", e)
        }
    }

    // --- WAKE LOCKS ---

    private fun acquireWakeLocks() {
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "UIRS:SocketCpuLock")
            wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hour timeout check

            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            // WIFI_MODE_FULL_HIGH_PERF is deprecated in recent Androids but safe to call
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "UIRS:SocketWifiLock")
            wifiLock?.acquire()
        } catch (e: Exception) {
            Log.e(TAG, "Error acquiring locks: ${e.message}")
        }
    }

    // --- NOTIFICATIONS ---

    private fun startForegroundServiceNotification() {
        createNotificationChannel()

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("UIRS Connected")
            .setContentText("Monitoring emergency network...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN) // Low priority (silent)
            .setOngoing(true)
            .build()

        // Android 14+ requires specifying the type if defined in manifest
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            } catch (e: Exception) {
                // Fallback if permission is missing (prevents crash)
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotificationStatus(text: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("UIRS Active")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()
        
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Connection Status",
                NotificationManager.IMPORTANCE_LOW // Low importance = No sound/vibration
            ).apply {
                description = "Shows the connection status of the emergency socket"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            mSocket?.disconnect()
            mSocket?.off()
            if (wakeLock?.isHeld == true) wakeLock?.release()
            if (wifiLock?.isHeld == true) wifiLock?.release()
            if (networkCallback != null) connectivityManager.unregisterNetworkCallback(networkCallback!!)
        } catch (e: Exception) {
            Log.e(TAG, "Error cleanup: ${e.message}")
        }
    }
}