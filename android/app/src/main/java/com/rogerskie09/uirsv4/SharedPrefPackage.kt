package com.rogerskie09.uirsv4

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import java.util.ArrayList

class SharedPrefPackage : ReactPackage {

    // This registers your modules
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val modules = ArrayList<NativeModule>()
        
        // 1. Your existing Shared Preferences Module
        modules.add(SharedPrefModule(reactContext))
        
        // 2. Add the NEW Permissions Module here
        modules.add(UirsPermissionsModule(reactContext))
        
        // If you created the AutoStart logic as a separate Module (optional), add it here too.
        // But in our previous step, we combined AutoStart into UirsPermissionsModule, 
        // so you only need the line above.
        
        return modules
    }

    // Since we aren't creating a custom UI View (like a special Button), return empty
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}