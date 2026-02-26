package com.rogerskie09.uirsv4

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*

class UirsPermissionsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "UirsPermissions"

    /**
     * JS Usage: const health = await UirsPermissions.checkHealth();
     * Returns the full report including 'hiddenRisks'.
     */
    @ReactMethod
    fun checkHealth(promise: Promise) {
        try {
            val status = PermissionManager.checkVitalHealth(reactApplicationContext)
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("CHECK_FAIL", "Failed to calculate device health", e)
        }
    }

    /**
     * JS Usage: await UirsPermissions.openAutoStart();
     * Uses the robust AutoStartHelper to find the hidden manufacturer settings.
     */
    @ReactMethod
    fun openAutoStart(promise: Promise) {
        try {
            // openAutoStartSettings handles its own intents and context safely
            AutoStartHelper.openAutoStartSettings(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUTOSTART_FAIL", "Failed to open AutoStart settings", e)
        }
    }

    /**
     * JS Usage: await UirsPermissions.openSettings("battery");
     * Handles specific system settings with smart 3-Tier fallbacks.
     */
    @ReactMethod
    fun openSettings(type: String, promise: Promise) {
        val activity = currentActivity
        val context = reactApplicationContext
        
        // If activity is dead, we can't launch UI safely
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Current Activity is null")
            return
        }

        val packageName = context.packageName
        
        val intent = when (type.lowercase()) {
            "overlay" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            } else null
            
            "battery" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                // Primary: Try to trigger the specific dialog
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            } else null
            
            "alarm" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
            } else null
            
            "fsi" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))
            } else null
            
            "dnd" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                 // DND Settings usually do not accept a package URI, they just open the list
                 Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            } else null

            "notification" -> {
                 val notifIntent = Intent()
                 if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { // Android 8+
                     notifIntent.action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                     notifIntent.putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                 } else {
                     notifIntent.action = "android.settings.APP_NOTIFICATION_SETTINGS"
                     notifIntent.putExtra("app_package", packageName)
                     notifIntent.putExtra("app_uid", context.applicationInfo.uid)
                 }
                 notifIntent
            }

            // Fallback for anything unrecognized
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
        }

        if (intent != null) {
            try {
                activity.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                // FALLBACK STRATEGY 1: Mid-Tier Battery Fallback
                if (type.lowercase() == "battery") {
                    try {
                        val batteryListIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                        activity.startActivity(batteryListIntent)
                        promise.resolve(true)
                        return
                    } catch (batteryEx: Exception) {
                        // Let it fall down to the App Details fallback below
                    }
                }

                // FALLBACK STRATEGY 2: Absolute Last Resort (App Details)
                // If the specific intent fails (e.g., Manufacturer blocked it),
                // we fall back to the standard App Info screen.
                try {
                    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallback) // Using React Context since Activity failed
                    promise.resolve(true)
                } catch (e2: Exception) {
                    // If even App Info fails, the phone is likely in a strict Kiosk mode.
                    promise.resolve(false)
                }
            }
        } else {
            // If intent is null (e.g. asking for FSI on Android 12), just open App Info as a safe default
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }
}