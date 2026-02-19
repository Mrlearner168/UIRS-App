package com.rogerskie09.uirsv4

import com.rogerskie09.uirsv4.SharedPrefPackage
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.res.Configuration
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {
  override val reactNativeHost: ReactNativeHost =
    ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
        
            override fun getPackages(): List<ReactPackage> {
                val packages = PackageList(this).packages.toMutableList()
                // Add custom packages here
                packages.add(SharedPrefPackage())
                return packages
            }
            
            override fun getJSMainModuleName(): String =
                ".expo/.virtual-metro-entry"
        
            override fun getUseDeveloperSupport(): Boolean =
                BuildConfig.DEBUG
        
            override val isNewArchEnabled: Boolean =
                BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        
            override val isHermesEnabled: Boolean =
                BuildConfig.IS_HERMES_ENABLED
        }
    )
        
  override val reactHost: ReactHost
      get() = ReactNativeHostWrapper.createReactHost(
          applicationContext,
          reactNativeHost
      )
        
  override fun onCreate() {
      super.onCreate()
  
      SoLoader.init(this, OpenSourceMergedSoMapping)
  
      if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
          load()
      }
    
      ApplicationLifecycleDispatcher.onApplicationCreate(this)
    
      createNotificationChannels()
  }
  
  private fun createNotificationChannels() {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
  
      val manager =
          getSystemService(NotificationManager::class.java)
  
      val emergencyChannel = NotificationChannel(
          "critical_alerts",
          "Emergency Alerts",
          NotificationManager.IMPORTANCE_HIGH
      ).apply {
          description = "Emergency alerts that wake the device"
          setBypassDnd(true)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 500, 250, 500)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    
      val updateChannel = NotificationChannel(
          "general_updates",
          "General Updates",
          NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
          description = "Standard app updates"
      }
    
      manager.createNotificationChannel(emergencyChannel)
      manager.createNotificationChannel(updateChannel)
  }
  
  override fun onConfigurationChanged(newConfig: Configuration) {
      super.onConfigurationChanged(newConfig)
      ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}