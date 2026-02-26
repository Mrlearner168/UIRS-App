package com.rogerskie09.uirsv4

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * A comprehensive helper to manage "Special App Access" permissions.
 *
 * COVERS:
 * 1. Autostart / Battery Optimization
 * 2. Display Overlays (SYSTEM_ALERT_WINDOW)
 * 3. Notifications (POST_NOTIFICATIONS)
 * 4. Do Not Disturb Access (ACCESS_NOTIFICATION_POLICY)
 * 5. Exact Alarms (SCHEDULE_EXACT_ALARM - Android 12+)
 * 6. Xiaomi Specific Permissions
 */
object AutoStartHelper {

    private const val TAG = "AutoStartHelper"

    // =========================================================================================
    // 1. STATUS CHECKS (Use these to update your UI)
    // =========================================================================================

    /**
     * Checks if "Ignore Battery Optimizations" is active.
     * This is the closest standard check for "Autostart".
     */
    fun isBatteryOptimizationIgnored(context: Context): Boolean {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true
        }
    }

    /**
     * Checks if "Display over other apps" is granted.
     */
    fun canDrawOverlays(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
    }

    /**
     * Checks if the user has allowed Notifications for this app.
     */
    fun areNotificationsEnabled(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // For Android 13+, this checks the runtime permission
            ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            // For older versions, checks the system switch
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
    }

    /**
     * Checks if "Do Not Disturb" access is granted.
     * Required for: ACCESS_NOTIFICATION_POLICY / MODIFY_AUDIO_SETTINGS
     */
    fun isDoNotDisturbAccessGranted(context: Context): Boolean {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            notificationManager.isNotificationPolicyAccessGranted
        } else {
            true
        }
    }

    /**
     * Checks if "Alarms & Reminders" permission is granted.
     * Highly recommended for apps using WAKE_LOCK and Autostart on Android 12+ (API 31+).
     */
    fun canScheduleExactAlarms(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }
    }

    // =========================================================================================
    // 2. NAVIGATION METHODS (Call these on button clicks)
    // =========================================================================================

    /**
     * 1. AUTOSTART: Tries Manufacturer screens first, then Battery Settings.
     */
    fun openAutoStartSettings(context: Context) {
        // Try Manufacturer Specific first (Xiaomi, Vivo, Oppo, etc.)
        if (openManufacturerSpecificSettings(context)) {
            Log.d(TAG, "Opened Manufacturer Specific Autostart")
            return
        }
        // Fallback to Battery Optimization List
        openBatteryOptimizationSettings(context)
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open Request Ignore Battery Optimizations", e)
                openBatteryOptimizationSettings(context)
            }
        }
    }

    fun openDisplayOverlaysSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open Overlay Settings", e)
                openAppDetails(context)
            }
        }
    }

    fun openNotificationSettings(context: Context) {
        try {
            val intent = Intent().apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                } else {
                    action = "android.settings.APP_NOTIFICATION_SETTINGS"
                    putExtra("app_package", context.packageName)
                    putExtra("app_uid", context.applicationInfo.uid)
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Notification Settings", e)
            openAppDetails(context)
        }
    }

    fun openDoNotDisturbSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open DND Settings", e)
                openAppDetails(context)
            }
        }
    }

    fun openAlarmsAndRemindersSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open Alarms Settings", e)
                openAppDetails(context)
            }
        }
    }

    fun openXiaomiPermissionEditor(context: Context) {
        try {
            val intent = Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                putExtra("extra_pkgname", context.packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open Xiaomi Permissions Editor", e)
            openAppDetails(context)
        }
    }

    fun openLocationSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            openAppDetails(context)
        }
    }

    fun openAppDetails(context: Context): Boolean {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            return true
        } catch (e: Exception) {
            // Absolute Last Resort
            try {
                context.startActivity(Intent(Settings.ACTION_SETTINGS))
                return true
            } catch (e2: Exception) {
                return false
            }
        }
    }

    private fun openManufacturerSpecificSettings(context: Context): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val targetIntents = getIntentsForManufacturer(manufacturer)
        
        for ((pkg, cls) in targetIntents) {
            try {
                val intent = Intent().apply {
                    component = ComponentName(pkg, cls)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                return true
            } catch (e: Exception) {
                continue
            }
        }
        return false
    }

    private fun openBatteryOptimizationSettings(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                return true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open Battery Optimization settings", e)
            }
        }
        return false
    }

    private fun getIntentsForManufacturer(manufacturer: String): List<Pair<String, String>> {
        val intents = mutableListOf<Pair<String, String>>()
        when {
            "samsung" in manufacturer -> {
                intents.add(Pair("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"))
                intents.add(Pair("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity"))
                intents.add(Pair("com.samsung.android.sm_devicesecurity", "com.samsung.android.sm.ui.battery.BatteryActivity"))
            }
            "xiaomi" in manufacturer || "redmi" in manufacturer || "poco" in manufacturer -> {
                intents.add(Pair("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"))
                intents.add(Pair("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"))
            }
            "realme" in manufacturer || "oppo" in manufacturer -> {
                intents.add(Pair("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"))
                intents.add(Pair("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"))
                intents.add(Pair("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"))
                intents.add(Pair("com.coloros.phonemanager", "com.coloros.phonemanager.App"))
            }
            "vivo" in manufacturer || "iqoo" in manufacturer -> {
                intents.add(Pair("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"))
                intents.add(Pair("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity"))
                intents.add(Pair("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"))
            }
            "nokia" in manufacturer -> {
                intents.add(Pair("com.evenwell.powersaving.g3", "com.evenwell.powersaving.g3.exception.PowerSaverExceptionActivity"))
            }
            "huawei" in manufacturer || "honor" in manufacturer -> {
                intents.add(Pair("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"))
                intents.add(Pair("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"))
            }
            "asus" in manufacturer -> {
                intents.add(Pair("com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity"))
                intents.add(Pair("com.asus.mobilemanager", "com.asus.mobilemanager.autostart.AutoStartActivity"))
            }
            "transsion" in manufacturer || "tecno" in manufacturer || "infinix" in manufacturer || "itel" in manufacturer -> {
                intents.add(Pair("com.transsion.phonemaster", "com.transsion.phonemaster.AutoStartManagementActivity"))
            }
            "oneplus" in manufacturer -> {
                 intents.add(Pair("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"))
            }
        }
        return intents
    }
}