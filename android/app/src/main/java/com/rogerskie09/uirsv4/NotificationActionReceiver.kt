package com.rogerskie09.uirsv4

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.NotificationManager
import android.util.Log

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Get the specific ID we want to stop (e.g., 999)
        val notificationId = intent.getIntExtra("notification_id", -1)

        if (notificationId != -1) {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            
            // Cancel the notification (stops sound and vibration)
            notificationManager.cancel(notificationId)
            
            Log.d("NotificationReceiver", "🛑 Alert stopped by user action (Button Click).")
        }
    }
}