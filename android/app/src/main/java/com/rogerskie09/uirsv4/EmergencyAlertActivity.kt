package com.rogerskie09.uirsv4

import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class EmergencyAlertActivity : AppCompatActivity() {

    private val TAG = "EmergencyActivity_DEBUG"
    private val SERVER_URL = "https://uirs.duckdns.org" // Ensure this is correct
    
    // Add timeouts to handle bad network conditions during emergencies
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 1. Force screen to wake up immediately
        turnScreenOnAndKeyguard()
        
        setContentView(R.layout.activity_emergency_alert)

        // 2. DATA EXTRACTION FROM INTENT
        val title = intent.getStringExtra("title") ?: "EMERGENCY"
        val body = intent.getStringExtra("body") ?: "Alert Received"
        // Support both "incident_id" (backend) and "id" (sometimes used by Firebase console)
        val incidentId = intent.getStringExtra("incident_id") 
                        ?: intent.getStringExtra("id") 
                        ?: ""

        // 3. AUTH & ROLE EXTRACTION
        val sharedPref = getSharedPreferences("MyAppData", Context.MODE_PRIVATE)
        val token = sharedPref.getString("token", "") ?: ""
        val stationId = sharedPref.getString("stationId", "") ?: ""
        val role = sharedPref.getString("role", "") ?: ""
        
        val isHeadStr = sharedPref.getString("isHead", "false") ?: "false"
        val isHead = isHeadStr.equals("true", ignoreCase = true)

        Log.d(TAG, "🔍 Context - Role: $role, isHead: $isHead, Incident ID: $incidentId")

        // 4. UI MAPPING
        findViewById<TextView>(R.id.tvTitle)?.text = title
        findViewById<TextView>(R.id.tvBody)?.text = body

        val btnAccept = findViewById<Button>(R.id.btnAccept)
        val btnDecline = findViewById<Button>(R.id.btnDecline)
        
        // Ensure your XML ID for the stop button matches this:
        val btnStopAlert = findViewById<Button>(R.id.btnAcknowledge) 
        val etReason = findViewById<EditText>(R.id.etDeclineReason)
        val layoutHeadActions = findViewById<View>(R.id.layoutHeadActions)

        // 5. ROLE VISIBILITY LOGIC
        val isResponderHead = role.equals("responder_head", ignoreCase = true)
        val isResponderPersonnel = role.equals("responder_personnel", ignoreCase = true)

        // Head Logic: Show Accept/Decline
        val showAcceptDecline = isResponderHead || (isResponderPersonnel && isHead)

        if (showAcceptDecline) {
            layoutHeadActions?.visibility = View.VISIBLE
            btnStopAlert?.visibility = View.GONE
            etReason.visibility = View.GONE
        } else {
            // Personnel Logic: Show only "STOP ALARM"
            layoutHeadActions?.visibility = View.GONE
            btnStopAlert?.visibility = View.VISIBLE
            btnStopAlert?.text = "Im Informed - Stop Alert"
            etReason.visibility = View.GONE
        }

        // 6. BUTTON LISTENERS

        // --- Personnel: Stop Sound Only ---
        btnStopAlert?.setOnClickListener {
            Log.d(TAG, "🔘 Stop Alert Clicked - Personnel")
            stopSoundOnly()
            goToDashboard(incidentId) // Optional: Send them to map anyway
        }

        // --- Head: Accept ---
        btnAccept?.setOnClickListener {
            Log.d(TAG, "🔘 Alert Accepted by Head")
            stopSoundOnly() // Stop noise immediately so they can think
            sendStatusToBackend(incidentId, stationId, token, "accepted", "Acknowledged via Mobile Alert")
        }

        // --- Head: Decline ---
        btnDecline?.setOnClickListener {
            if (etReason.visibility == View.GONE) {
                // First click: Stop sound, show input
                stopSoundOnly()
                etReason.visibility = View.VISIBLE
                btnAccept.visibility = View.GONE 
                btnDecline.text = "CONFIRM DECLINE"
                etReason.requestFocus()
            } else {
                // Second click: Send data
                val reason = etReason.text.toString().trim()
                if (reason.isNotEmpty()) {
                    Log.d(TAG, "❌ Alert Declined: $reason")
                    sendStatusToBackend(incidentId, stationId, token, "declined", reason)
                } else {
                    etReason.error = "Please enter a reason"
                }
            }
        }
    }

    // Stop the Service (Sound/Vibrate/Flash) but keep Activity open
    private fun stopSoundOnly() {
        val stopIntent = Intent(this, EmergencyAlertService::class.java).apply { 
            action = "STOP_SERVICE" 
        }
        startService(stopIntent)
    }

    // Open Dashboard and Focus on Incident
    private fun goToDashboard(incidentId: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("navigate_to", "responder_dashboard")
            putExtra("incident_id", incidentId)
            putExtra("focus_on_map", true)
        }
        startActivity(intent)
        finish()
    }

    private fun sendStatusToBackend(incidentId: String, stationId: String, token: String, status: String, remarks: String) {
        if (incidentId.isEmpty() || stationId.isEmpty()) {
            runOnUiThread { showResponseDialog("Error", "Missing Incident ID or Station ID.", false) }
            return
        }

        val url = "$SERVER_URL/incident/$incidentId/station/$stationId/status"
        
        val json = JSONObject().apply {
            put("acceptDecline", status)
            put("remarks", remarks)
        }
        
        val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url(url)
            .put(body)
            .addHeader("Authorization", "Bearer $token")
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Now it has: Title (String), Message (String), and isSuccess (Boolean)
                runOnUiThread { showResponseDialog("Connection Failed", "Check your internet and try again.", false) }
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string() ?: ""
                response.close() // Always close body

                runOnUiThread {
                    if (response.isSuccessful) {
                        // SUCCESS: Don't just show dialog, GO TO DASHBOARD!
                        if (status == "accepted") {
                            goToDashboard(incidentId)
                        } else {
                            finish() // If declined, just close app
                        }
                    } else {
                        showResponseDialog("Error", "Failed to update status", false)
                    }
                }
            }
        })
    }

    private fun showResponseDialog(title: String, message: String, isSuccess: Boolean) {
        if (isFinishing) return
        
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK") { dialog, _ ->
                dialog.dismiss()
                if (isSuccess) finish()
            }
            .show()
    }

    private fun turnScreenOnAndKeyguard() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
            )
        }
    }
}