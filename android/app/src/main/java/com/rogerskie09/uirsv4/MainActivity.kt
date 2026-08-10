package com.rogerskie09.uirsv4

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
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
        // 1. Set Theme (Must be before super.onCreate)
        setTheme(R.style.AppTheme)
        
        super.onCreate(savedInstanceState)

        // 2. START THE SOCKET SERVICE
        // This ensures that as soon as the user opens the app, the background 
        // socket connection starts listening for alerts.
        startSocketService()
        
        // 3. LOCK SCREEN BYPASS LOGIC
        // If the app is opened via an emergency intent, allow it to show over the lockscreen
        handleLockScreenVisibility(intent)
    }

    private fun startSocketService() {
        val sharedPref = getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
        val token = sharedPref.getString("token", null)
        val userId = sharedPref.getString("userId", null)

        // Only start the socket service if auth data is already present.
        if (token.isNullOrBlank() || userId.isNullOrBlank()) {
            return
        }

        val serviceIntent = Intent(this, SocketService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    private fun handleLockScreenVisibility(intent: Intent?) {
        val isEmergency = intent?.extras?.getString("type")?.contains("emergency", ignoreCase = true) == true || 
                          intent?.extras?.containsKey("incident_id") == true

        if (isEmergency) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true)
                setTurnScreenOn(true)
                val keyguardManager = getSystemService(KEYGUARD_SERVICE) as android.app.KeyguardManager
                keyguardManager.requestDismissKeyguard(this, null)
            } else {
                @Suppress("DEPRECATION")
                window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                )
            }
        }
    }
    
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLockScreenVisibility(intent) // Re-check if new intent is an emergency
        handleNotificationIntent(intent)
    }
    
    private fun handleNotificationIntent(intent: Intent?) {
        if (intent == null) return
        val bundle = intent.extras ?: return

        val params = Arguments.createMap()
        
        for (key in bundle.keySet()) {
            val value = bundle.get(key)
            when (value) {
                is String -> params.putString(key, value)
                is Boolean -> params.putBoolean(key, value)
                is Double -> params.putDouble(key, value)
                is Int -> params.putInt(key, value)
                is Long -> params.putDouble(key, value.toDouble()) 
            }
        }

        try {
            val reactApp = application as ReactApplication
            val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext
            
            if (reactContext != null) {
                // This sends the "onEmergencyNotification" event to your React Native useEffect listeners
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
                // This passes initial data as Props to App.js (for Cold Starts)
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