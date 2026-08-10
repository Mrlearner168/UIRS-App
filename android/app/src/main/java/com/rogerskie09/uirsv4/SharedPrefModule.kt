package com.rogerskie09.uirsv4

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*

class SharedPrefModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SharedPrefModule"

    @ReactMethod
    fun saveData(data: ReadableMap, promise: Promise) {
        Log.d("SharedPrefModule", "🚀 NATIVE RECEIVE START")
        
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
            val editor = sharedPref.edit()
        
            val iterator = data.keySetIterator()
            var count = 0
        
            while (iterator.hasNextKey()) {
                val key = iterator.nextKey()
                // Use getString safely
                val value = if (data.getType(key) == ReadableType.String) {
                    data.getString(key)
                } else {
                    data.getDynamic(key).asString() // Fallback for other types
                }
                
                editor.putString(key, value)
                Log.d("SharedPrefModule", "📍 Received: $key = $value")
                count++
            }
        
            val committed = editor.commit()
            if (!committed) {
                Log.w("SharedPrefModule", "⚠️ Failed to commit shared preferences synchronously.")
            }
            Log.d("SharedPrefModule", "✅ Saved $count items.")
             

            // Ensure the native SocketService is started or restarted once login data is available
            startSocketService()
            promise.resolve(true)
        
        } catch (e: Exception) {
            Log.e("SharedPrefModule", "❌ NATIVE ERROR: ${e.message}")
            promise.reject("SAVE_ERROR", e.message)
        }
    }

    private fun startSocketService() {
        try {
            val serviceIntent = Intent(reactApplicationContext, SocketService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
            Log.d("SharedPrefModule", "🔁 SocketService start requested after native auth sync.")
        } catch (e: Exception) {
            Log.e("SharedPrefModule", "❌ Error starting SocketService: ${e.message}")
        }
    }

    // Adding this so your "Logged Out" logic works!
    @ReactMethod
    fun clearDataAndStopService(promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
            sharedPref.edit().clear().commit()
            Log.d("SharedPrefModule", "🗑️ Data Cleared")

            val stopIntent = Intent(reactApplicationContext, SocketService::class.java)
            reactApplicationContext.stopService(stopIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", e.message)
        }
    }
}