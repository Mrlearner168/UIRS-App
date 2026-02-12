package com.rogerskie09.uirsv4

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutoStartModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AutoStartModule"

    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        val intent = Intent()
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        val componentLists = listOf(
            Pair("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            Pair("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"),
            Pair("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            Pair("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity"),
            Pair("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
            Pair("com.iqoo.secure", "com.iqoo.secure.MainGuideActivity"),
            Pair("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            Pair("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            Pair("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
            Pair("com.coloros.phonemanager", "com.coloros.phonemanager.App"),
            Pair("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            Pair("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
            Pair("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
            Pair("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")
        )

        var success = false

        for ((pkg, cls) in componentLists) {
            try {
                intent.component = ComponentName(pkg, cls)
                reactApplicationContext.startActivity(intent)
                success = true
                break // Stop if we successfully launched one
            } catch (e: Exception) {
                // Ignore error and try the next one in the list
                continue
            }
        }

        if (success) {
            promise.resolve(true)
        } else {
            // If none worked, try opening standard settings as a fallback
            try {
                val settingsIntent = Intent(android.provider.Settings.ACTION_SETTINGS)
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(settingsIntent)
                promise.resolve(false)
            } catch (e: Exception) {
                promise.reject("ERR_AUTOSTART", "Could not open any settings")
            }
        }
    }
}