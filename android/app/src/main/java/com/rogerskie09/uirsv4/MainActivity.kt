package com.rogerskie09.uirsv4

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication // Correct import
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // 1. Set Theme (Must be before super.onCreate)
        setTheme(R.style.AppTheme)
        
        // 2. Call Super
        super.onCreate(savedInstanceState)
        
        // 3. CHECK FOR EMERGENCY SIGNAL
        // We check if the intent has the specific "type" = "EMERGENCY"
        // OR if it has a "body" (which usually comes from the notification)
        val isEmergency = intent?.extras?.getString("type")?.equals("emergency", ignoreCase = true) == true || 
                          intent?.extras?.containsKey("body") == true 
        
        // 4. ONLY ENABLE LOCK SCREEN BYPASS IF IT IS AN EMERGENCY
        if (isEmergency) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true)
                setTurnScreenOn(true)
                // Optional: Keyguard dismissal for newer Androids
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
        // 5. Handle notification when app is already running (Warm Start)
        setIntent(intent)
        handleNotificationIntent(intent)
    }
    
    private fun handleNotificationIntent(intent: Intent?) {
        if (intent == null) return
        
        // Safety Check: Ensure extras exist before trying to read them
        val bundle = intent.extras ?: return

        // We can just forward everything, or check for specific keys
        val navigateTo = bundle.getString("navigate_to")
        // If you want to force emit even without "navigate_to", remove the check below
        // if (navigateTo == null) return 

        val params = Arguments.createMap()
        
        // Copy all bundle data to React Native map
        for (key in bundle.keySet()) {
            val value = bundle.get(key)
            when (value) {
                is String -> params.putString(key, value)
                is Boolean -> params.putBoolean(key, value)
                is Double -> params.putDouble(key, value)
                is Int -> params.putInt(key, value)
                // Add Long support if needed (often used for timestamps)
                is Long -> params.putDouble(key, value.toDouble()) 
            }
        }

        // FIX: Correctly access reactNativeHost via the Application class
        try {
            val reactApp = application as ReactApplication
            val reactContext = reactApp.reactNativeHost.reactInstanceManager.currentReactContext
            
            if (reactContext != null) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onEmergencyNotification", params)
            } else {
                // If context is null, the app might be initializing. 
                // The 'getLaunchOptions' will handle the data in that case.
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
                // 6. THIS IS THE FIX FOR COLD STARTS
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