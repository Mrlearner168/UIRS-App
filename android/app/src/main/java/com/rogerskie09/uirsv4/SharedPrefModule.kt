package com.rogerskie09.uirsv4

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.*

class SharedPrefModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SharedPrefModule"

    @ReactMethod
    fun saveData(data: ReadableMap) {
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
        
            editor.apply()
            Log.d("SharedPrefModule", "✅ Saved $count items.")
            
        } catch (e: Exception) {
            Log.e("SharedPrefModule", "❌ NATIVE ERROR: ${e.message}")
        }
    }

    // Adding this so your "Logged Out" logic works!
    @ReactMethod
    fun clearDataAndStopService(promise: Promise) {
        try {
            val sharedPref = reactApplicationContext.getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
            sharedPref.edit().clear().apply()
            Log.d("SharedPrefModule", "🗑️ Data Cleared")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLEAR_ERROR", e.message)
        }
    }
}