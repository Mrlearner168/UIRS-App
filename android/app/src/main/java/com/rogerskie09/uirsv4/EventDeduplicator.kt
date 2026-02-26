package com.rogerskie09.uirsv4

import android.util.Log

/**
 * A Singleton Helper optimized for dual-channel (Socket + FCM) emergency alerts.
 */
object EventDeduplicator {

    private const val TAG = "EventDeduplicator_DEBUG"

    // Maps Incident ID to its Last Processed Time (Handles multiple incidents at once)
    private val processedIncidents = mutableMapOf<String, Long>()

    @Volatile
    private var lastGlobalAlertTime: Long = 0

    // CONFIGURATION
    private const val REDUNDANCY_WINDOW_MS = 5000L      // 5s: Same ID within 5s = REINFORCE
    private const val DUPLICATE_ID_THRESHOLD_MS = 30000L // 30s: Same ID 5s-30s = IGNORE
    private const val GLOBAL_COOLDOWN_MS = 3000L        // 3s: Anti-Spam for different IDs

    enum class Decision {
        LAUNCH_NEW,    // First time seeing this ID. Start everything.
        REINFORCE,     // Same ID, arrived via 2nd channel. Keep siren on.
        IGNORE         // True spam or already handled duplicate.
    }

    /**
     * Determines the action to take for an incoming incident.
     */
    @Synchronized
    fun checkIncident(incidentId: String?): Decision {
        if (incidentId.isNullOrEmpty()) {
            Log.e(TAG, "⚠️ Blocked: Incoming Incident ID is NULL")
            return Decision.IGNORE
        }

        val currentTime = System.currentTimeMillis()
        val lastSeenThisIncident = processedIncidents[incidentId]
        val timeSinceGlobalAlert = currentTime - lastGlobalAlertTime

        // CASE 1: We have seen this specific Incident ID before
        if (lastSeenThisIncident != null) {
            val timeSinceThisIncident = currentTime - lastSeenThisIncident

            return when {
                // Scenario: Socket at 0.5s, FCM at 1.0s. 
                // Decision: REINFORCE (Don't block, just treat as backup)
                timeSinceThisIncident < REDUNDANCY_WINDOW_MS -> {
                    processedIncidents[incidentId] = currentTime // Update timer
                    Log.d(TAG, "📢 REINFORCEMENT: Dual-channel signal for '$incidentId'")
                    Decision.REINFORCE
                }
                
                // Scenario: Same ID arrives again after 15 seconds.
                // Decision: IGNORE (Already handled recently)
                timeSinceThisIncident < DUPLICATE_ID_THRESHOLD_MS -> {
                    Log.w(TAG, "🛑 DUPLICATE: Incident '$incidentId' handled ${timeSinceThisIncident / 1000}s ago.")
                    Decision.IGNORE
                }
                
                // Scenario: Same ID arrives after 30 seconds.
                // Decision: LAUNCH_NEW (Treat as a re-escalation)
                else -> {
                    approveAlert(incidentId, currentTime)
                    Decision.LAUNCH_NEW
                }
            }
        }

        // CASE 2: New Incident ID, but arriving too fast after a DIFFERENT ID
        if (timeSinceGlobalAlert < GLOBAL_COOLDOWN_MS) {
            Log.w(TAG, "🛑 SPAM BLOCKED: New ID '$incidentId' arrived too soon after another alert.")
            return Decision.IGNORE
        }

        // CASE 3: Approved New Incident
        approveAlert(incidentId, currentTime)
        return Decision.LAUNCH_NEW
    }

    private fun approveAlert(id: String, time: Long) {
        Log.d(TAG, "✅ ALERT APPROVED: ID=$id")
        processedIncidents[id] = time
        lastGlobalAlertTime = time
        
        // Clean up old entries (older than 30s) to save memory
        processedIncidents.entries.removeIf { time - it.value > DUPLICATE_ID_THRESHOLD_MS }
    }

    @Synchronized
    fun reset() {
        processedIncidents.clear()
        lastGlobalAlertTime = 0
        Log.d(TAG, "🔄 Deduplicator Reset.")
    }
}