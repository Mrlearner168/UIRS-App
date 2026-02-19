package com.rogerskie09.uirsv4

import android.app.Activity
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
            promise.reject("CHECK_FAIL", e)
        }
    }

    /**
     * JS Usage: await UirsPermissions.openAutoStart();
     * Uses the robust AutoStartHelper to find the hidden manufacturer settings.
     */
    @ReactMethod
    fun openAutoStart(promise: Promise) {
        try {
            // FIXED: openAutoStartSettings is a void function in the Helper. 
            // We just call it and resolve true if no crash occurs.
            AutoStartHelper.openAutoStartSettings(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUTOSTART_FAIL", e)
        }
    }

    /**
     * JS Usage: UirsPermissions.openSettings("battery");
     * Handles specific system settings with smart fallbacks.
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
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            
            "battery" -> {
                // Primary: Try to trigger the specific dialog
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
            }
            
            "alarm" -> if (Build.VERSION.SDK_INT >= 31) {
                Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
            } else null
            
            "fsi" -> if (Build.VERSION.SDK_INT >= 34) {
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))
            } else null
            
            "dnd" -> if (Build.VERSION.SDK_INT >= 23) {
                 // DND Settings usually do not accept a package URI, they just open the list
                 Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
            } else null

            "notification" -> {
                 val intent = Intent()
                 if (Build.VERSION.SDK_INT >= 26) {
                     intent.action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                     intent.putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                 } else {
                     intent.action = "android.settings.APP_NOTIFICATION_SETTINGS"
                     intent.putExtra("app_package", packageName)
                     intent.putExtra("app_uid", context.applicationInfo.uid)
                 }
                 intent
            }

            // Fallback for everything else
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
        }

        if (intent != null) {
            try {
                activity.startActivity(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                // FALLBACK STRATEGY:
                // If the specific intent fails (e.g., Manufacturer blocked "Ignore Battery" dialog),
                // we fall back to the standard App Info screen where the user can find it manually.
                try {
                    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                    activity.startActivity(fallback)
                    promise.resolve(true)
                } catch (e2: Exception) {
                    // If even App Info fails, the phone is likely in a restricted kiosk mode.
                    promise.resolve(false)
                }
            }
        } else {
            // If intent is null (e.g. asking for FSI on Android 12), just open App Info as a safe default
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                activity.startActivity(fallback)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }
}