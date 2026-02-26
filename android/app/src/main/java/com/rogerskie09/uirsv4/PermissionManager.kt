package com.rogerskie09.uirsv4

import android.Manifest
import android.app.AlarmManager
import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.lang.reflect.Method

/**
 * Central logic for checking system health and permissions.
 * Designed for Android 14/15 robustness with "Crash-Proof" fallbacks.
 * Includes "Deep Search" for hidden manufacturer settings.
 */
object PermissionManager {

    private const val TAG = "PermissionManager"

    // Comprehensive list of OEMs known for aggressive background killing
    private val HIGH_RISK_MANUFACTURERS = listOf(
        "samsung", "xiaomi", "redmi", "poco", "oppo", "vivo", "iqoo", 
        "huawei", "honor", "tecno", "infinix", "realme", "oneplus", 
        "asus", "transsion", "itel"
    )

    /**
     * Generates a detailed "Health Report" for React Native.
     * Guaranteed to never throw an exception.
     */
    fun checkVitalHealth(context: Context): WritableMap {
        val map = Arguments.createMap()

        try {
            // --- 1. Standard Hardware-Aware Permissions ---
            val permissionsToCheck = getRequiredPermissionsForDevice(context)
            val missingRuntime = permissionsToCheck.filter { perm ->
                try {
                    ContextCompat.checkSelfPermission(context, perm) != PackageManager.PERMISSION_GRANTED
                } catch (e: Exception) {
                    true // If check fails, assume missing to be safe
                }
            }
            val hasRuntime = missingRuntime.isEmpty()
            map.putBoolean("runtimeGranted", hasRuntime)
            
            val missingArray = Arguments.createArray()
            missingRuntime.forEach { missingArray.pushString(it) }
            map.putArray("missingRuntimePermissions", missingArray)

            // --- 2. Standard System Capabilities ---
            val hasOverlay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try { Settings.canDrawOverlays(context) } catch (e: Exception) { false }
            } else true
            map.putBoolean("overlayGranted", hasOverlay)

            val hasBattery = try {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    pm?.isIgnoringBatteryOptimizations(context.packageName) ?: true
                } else true
            } catch (e: Exception) { true }
            map.putBoolean("batteryGranted", hasBattery)

            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

            val hasFSI = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    nm?.canUseFullScreenIntent() ?: true
                } catch (e: Exception) { true }
            } else true
            map.putBoolean("fsiGranted", hasFSI)

            val hasAlarm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                    am?.canScheduleExactAlarms() ?: true
                } catch (e: Exception) { true }
            } else true
            map.putBoolean("alarmGranted", hasAlarm)

            val hasDND = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try { nm?.isNotificationPolicyAccessGranted ?: true } catch (e: Exception) { true }
            } else true
            map.putBoolean("dndGranted", hasDND)
            
            val notificationsEnabled = try { nm?.areNotificationsEnabled() ?: true } catch (e: Exception) { true }
            map.putBoolean("notificationsEnabled", notificationsEnabled)

            // --- 3. HIDDEN SETTINGS & RISK DETECTION ---
            val hiddenRisks = detectHiddenRisks(context)
            
            val isHighRisk = hiddenRisks.getBoolean("isHighRiskDevice")
            val autoStartGranted = hiddenRisks.getBoolean("miuiAutoStartGranted") 
            val manualCheckRequired = hiddenRisks.getBoolean("manualCheckRequired") 
            
            map.putMap("hiddenRisks", hiddenRisks)

            // --- 4. Overall Readiness Calculation ---
            val isStandardReady = hasRuntime && hasOverlay && hasBattery && hasFSI && hasAlarm && hasDND && notificationsEnabled
            
            // If it's Xiaomi and AutoStart is definitively FALSE -> RESTRICTED.
            val isXiaomiRestricted = isHighRisk && !manualCheckRequired && !autoStartGranted

            map.putBoolean("isRobust", isStandardReady && !isXiaomiRestricted)

        } catch (e: Exception) {
            Log.e(TAG, "Fatal error generating health report", e)
            // Failsafe map to prevent React Native crash
            map.putBoolean("isRobust", false)
            map.putBoolean("runtimeGranted", false)
            map.putArray("missingRuntimePermissions", Arguments.createArray())
        }

        return map
    }

    /**
     * "Deep Search" for hidden manufacturer restrictions using Reflection.
     */
    private fun detectHiddenRisks(context: Context): WritableMap {
        val map = Arguments.createMap()
        val manufacturer = Build.MANUFACTURER.lowercase()
        
        // A. Identify High Risk Devices (NOW INCLUDES SAMSUNG)
        val isHighRisk = HIGH_RISK_MANUFACTURERS.any { manufacturer.contains(it) }
        map.putBoolean("isHighRiskDevice", isHighRisk)

        // B. Brand Specific Checks
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") || manufacturer.contains("poco")) {
            // Xiaomi allows programmatic checking via reflection
            val autoStart = checkOp(context, 10008) 
            map.putBoolean("miuiAutoStartGranted", autoStart)
            
            val showOnLock = checkOp(context, 10020) 
            map.putBoolean("miuiShowOnLockScreenGranted", showOnLock)
            
            // We can check status, so manual check is NOT blindly required
            map.putBoolean("manualCheckRequired", false)
            
        } else if (isHighRisk) {
            // Samsung, Oppo, Vivo, Realme, etc. DO NOT allow programmatic checking.
            // We must assume TRUE to avoid blocking code execution, but flag it for the UI.
            map.putBoolean("miuiAutoStartGranted", true) 
            map.putBoolean("miuiShowOnLockScreenGranted", true)
            
            // CRITICAL: Tell UI to show "Check Settings" button because we are blind here
            map.putBoolean("manualCheckRequired", true)
        } else {
            // Standard Android (Pixel, Moto, Nothing)
            map.putBoolean("miuiAutoStartGranted", true)
            map.putBoolean("miuiShowOnLockScreenGranted", true)
            map.putBoolean("manualCheckRequired", false)
        }

        return map
    }

    /**
     * Reflection helper to check hidden AppOps (primarily for MIUI).
     * Returns TRUE if check fails to ensure "Fail Open" behavior.
     */
    private fun checkOp(context: Context, opCode: Int): Boolean {
        return try {
            val appOpsManager = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
                ?: return true // Fail open if service is null

            val clazz = AppOpsManager::class.java
            val method: Method = clazz.getMethod(
                "checkOpNoThrow", 
                Int::class.javaPrimitiveType, 
                Int::class.javaPrimitiveType, 
                String::class.java
            )
            val result = method.invoke(
                appOpsManager, 
                opCode, 
                Process.myUid(), 
                context.packageName
            ) as Int
            
            result == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) {
            Log.w(TAG, "Reflection check failed for opCode $opCode. Falling back to true.", e)
            true 
        }
    }

    /**
     * SAFETY CHECK: Call this inside your Service before calling startForeground().
     * Verifies if the app has the necessary privileges to launch UI from background.
     */
    fun isServiceLaunchSafe(context: Context): Boolean {
        try {
            val pm = context.packageManager
            
            // 1. Hardware Permissions (Camera/Mic) for Foreground Service Types
            val hasCameraHardware = pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
            val hasMicHardware = pm.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)

            val hasCameraPerm = if (hasCameraHardware) {
                ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            } else true 

            val hasMicPerm = if (hasMicHardware) {
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            } else true 
            
            if (!hasCameraPerm || !hasMicPerm) {
                Log.e(TAG, "Missing Hardware Permissions for Foreground Service.")
                return false
            }

            // 2. Android 13+ Notification Permission Requirement
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val hasNotifications = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                if (!hasNotifications) {
                    Log.e(TAG, "Missing POST_NOTIFICATIONS permission. FGS will fail.")
                    return false
                }
            }

            // 3. Android 14+ Background Launch Requirements
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val hasOverlay = try { Settings.canDrawOverlays(context) } catch (e: Exception) { false }
                
                val hasFSI = try {
                    context.getSystemService(NotificationManager::class.java)?.canUseFullScreenIntent() ?: true
                } catch (e: Exception) { true }
                
                // On Android 14, you generally need EITHER Overlay permission OR Full Screen Intent permission
                // to successfully interrupt the user or start an activity from background.
                if (!hasOverlay && !hasFSI) {
                    Log.e(TAG, "Missing Overlay AND Full Screen Intent. Cannot launch from background on Android 14.")
                    return false
                }
            }

            return true

        } catch (e: Exception) {
            Log.e(TAG, "Exception during isServiceLaunchSafe check", e)
            // Fail safely - return false so the service doesn't attempt to start and crash the app
            return false
        }
    }

    /**
     * Dynamically builds the list of required permissions based on OS level and Hardware.
     */
    private fun getRequiredPermissionsForDevice(context: Context): List<String> {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        val pm = context.packageManager
        
        if (pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) perms.add(Manifest.permission.CAMERA)
        if (pm.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)) perms.add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) perms.add(Manifest.permission.POST_NOTIFICATIONS)
        
        return perms
    }
}