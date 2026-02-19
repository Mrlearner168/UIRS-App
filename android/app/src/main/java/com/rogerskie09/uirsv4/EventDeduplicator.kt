package com.rogerskie09.uirsv4

import android.util.Log

/**
 * A Singleton Helper to prevent the Emergency Screen/Siren from launching
 * multiple times for the exact same incident within a short window.
 */
object EventDeduplicator {

    private const val TAG = "EventDeduplicator_DEBUG"

    // Storage for the last event
    @Volatile
    private var lastIncidentId: String? = null
    @Volatile
    private var lastProcessedTime: Long = 0

    // CONFIGURATION
    // 1. Same ID Threshold: Block the SAME incident if it arrives within 30 seconds
    // (Increased to 30s because FCM can sometimes be delayed)
    private const val DUPLICATE_ID_THRESHOLD_MS = 30000L 
    
    // 2. Global Cooldown: Block ANY new alert if one just happened 3 seconds ago 
    private const val GLOBAL_COOLDOWN_MS = 3000L

    /**
     * Checks if we should process this incident.
     * Returns TRUE if it is NEW and SAFE to launch.
     */
    @Synchronized
    fun isNewIncident(incidentId: String?): Boolean {
        if (incidentId.isNullOrEmpty()) {
            Log.e(TAG, "⚠️ Blocked: Incoming Incident ID is NULL or Empty")
            return false 
        }

        val currentTime = System.currentTimeMillis()
        val timeSinceLastAlert = currentTime - lastProcessedTime

        // CHECK 1: Is this the EXACT same ID as the last one?
        if (incidentId == lastIncidentId) {
            if (timeSinceLastAlert < DUPLICATE_ID_THRESHOLD_MS) {
                Log.w(TAG, "🛑 DUPLICATE BLOCKED: Incident '$incidentId' was handled ${timeSinceLastAlert / 1000}s ago.")
                return false
            }
        }

        // CHECK 2: Global Cooldown (Anti-Spam)
        if (timeSinceLastAlert < GLOBAL_COOLDOWN_MS) {
            Log.w(TAG, "🛑 SPAM BLOCKED: Waiting for global cooldown (${timeSinceLastAlert}ms since last alert).")
            return false
        }

        // APPROVED
        Log.d(TAG, "✅ ALERT APPROVED: ID=$incidentId. Time since last: ${timeSinceLastAlert}ms")
        
        lastIncidentId = incidentId
        lastProcessedTime = currentTime
        
        return true
    }
    
    /**
     * Call this when the user clicks "Stop" or "Dismiss" in the UI
     * to allow the phone to receive a brand new alert immediately.
     */
    @Synchronized
    fun reset() {
        lastIncidentId = null
        lastProcessedTime = 0
        Log.d(TAG, "🔄 Deduplicator Reset. Ready for new alerts.")
    }
}