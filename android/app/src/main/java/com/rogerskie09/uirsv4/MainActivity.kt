package com.rogerskie09.uirsv4

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // 1. Set the theme for the Splash Screen
        setTheme(R.style.AppTheme)

        // 2. Add Wake Screen / Lock Screen flags safely
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        super.onCreate(savedInstanceState)
    }
    
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // 3. Handle notification when app is already running (Warm Start)
        setIntent(intent)
        handleNotificationIntent(intent)
    }
    
    private fun handleNotificationIntent(intent: Intent?) {
        if (intent == null) return
        
        val navigateTo = intent.getStringExtra("navigate_to")
        val isEmergency = intent.getBooleanExtra("is_emergency", false)
        
        // If there is no navigation data, ignore
        if (navigateTo == null) return

        val params = Arguments.createMap().apply {
            putBoolean("is_emergency", isEmergency)
            putString("navigate_to", navigateTo)
            
            // Forward all extras to JS just in case
            val bundle = intent.extras
            if (bundle != null) {
                for (key in bundle.keySet()) {
                    val value = bundle.get(key)
                    if (value is String) putString(key, value)
                    if (value is Boolean) putBoolean(key, value)
                    if (value is Double) putDouble(key, value)
                    if (value is Int) putInt(key, value)
                }
            }
        }

        // FIX: Correctly access reactNativeHost via the Application class
        try {
            val reactApp = application as ReactApplication
            val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext
            
            if (reactContext != null) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onEmergencyNotification", params)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getMainComponentName(): String = "main"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(
                this,
                mainComponentName,
                fabricEnabled
            ){
                // 4. THIS IS THE FIX FOR COLD STARTS
                // We pass the intent extras directly as "props" to the Root Component (App.js)
                override fun getLaunchOptions(): Bundle? {
                    val initialProps = Bundle()
                    intent?.extras?.let {
                        initialProps.putAll(it)
                    }
                    return initialProps
                }
            }
        )
    }

    override fun invokeDefaultOnBackPressed() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
            if (!moveTaskToBack(false)) {
                super.invokeDefaultOnBackPressed()
            }
            return
        }
        super.invokeDefaultOnBackPressed()
    }
}