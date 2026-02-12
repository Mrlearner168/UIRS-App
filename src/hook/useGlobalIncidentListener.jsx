import { SERVER_URL } from "@env";
import { Audio } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, Vibration } from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import showDeclineModal from "../components/DeclineModal";
import { AuthContext } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";

export const useGlobalIncidentListener = (addIncidentToList) => {
  const { socket } = useSocket();
  const { showAlert, showToast } = useToast();
  const { authData } = useContext(AuthContext);

  const soundRef = useRef(null);
  const vibrationRef = useRef(null);
  const wakeUpActiveRef = useRef(false);
  const alertTimeoutRef = useRef(null);
  const handlerRef = useRef(null);

  const stationId = authData?.stationId;
  const userRole = authData?.role;
  const userId = authData?.id;
  const is_head = authData?.is_head;

  const [currentIncident, setCurrentIncident] = useState(null);
  const incidentRef = useRef(null);

  // Activate wake lock to keep phone awake during incident
  const activateWakeLock = useCallback(async () => {
    if (wakeUpActiveRef.current) return;
    try {
      await activateKeepAwakeAsync();
      wakeUpActiveRef.current = true;
    } catch (error) {
      console.warn("Failed to activate wake lock:", error.message);
    }
  }, []);

  // Deactivate wake lock
  const deactivateWakeLock = useCallback(async () => {
    if (!wakeUpActiveRef.current) return;
    try {
      await deactivateKeepAwake();
      wakeUpActiveRef.current = false;
    } catch (error) {
      console.warn("Failed to deactivate wake lock:", error.message);
    }
  }, []);

  const startAlertEffects = useCallback(async () => {
    try {
      // Activate wake lock first to ensure phone wakes up
      await activateWakeLock();

      // Stop any existing sound
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) {
          console.warn("Error unloading previous sound:", e.message);
        }
        soundRef.current = null;
      }

      // Load and play alert sound
      try {
        const { sound } = await Audio.Sound.createAsync(
          require("../../assets/alert.mp3"),
          { shouldPlay: true, isLooping: true }
        );
        soundRef.current = sound;
      } catch (error) {
        console.warn("Error loading alert sound:", error.message);
      }

      // Start vibration pattern
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
      }
      vibrationRef.current = setInterval(() => {
        try {
          Vibration.vibrate([400, 400]);
        } catch (e) {
          console.warn("Vibration error:", e.message);
        }
      }, 800);
    } catch (e) {
      console.error("Error starting alert effects:", e.message);
    }
  }, [activateWakeLock]);

  const stopAlertEffects = useCallback(async () => {
    try {
      // Clear any pending alerts
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }

      // Stop sound
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) {
          console.warn("Error stopping sound:", e.message);
        }
        soundRef.current = null;
      }

      // Stop vibration
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }

      try {
        Vibration.cancel();
      } catch (e) {
        console.warn("Error canceling vibration:", e.message);
      }

      // Deactivate wake lock
      await deactivateWakeLock();
    } catch (e) {
      console.error("Error stopping alert effects:", e.message);
    }
  }, [deactivateWakeLock]);

  const onClose = useCallback((incident) => {
    if (!incident) return;
    // Cleanup when modal closes
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current);
      alertTimeoutRef.current = null;
    }
  }, []);

  const handleStatusChange = useCallback(async (incident, stationIdParam, newStatus, remarksText = "") => {
    if (!incident?.id || !stationIdParam) {
      console.warn("Invalid incident or station data");
      return;
    }

    try {
      await stopAlertEffects();

      const token = await EncryptedStorage.getItem("token");
      if (!token) {
        Alert.alert("Error", "Authentication token not found");
        return;
      }

      const response = await fetch(
        `${SERVER_URL}/incident/${incident.id}/station/${stationIdParam}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ acceptDecline: newStatus, remarks: remarksText }),
          timeout: 10000,
        }
      );

      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Responder status updated successfully.", [
          { text: "OK", onPress: () => onClose(incident) },
        ]);
        setCurrentIncident(null);
        incidentRef.current = null;
      } else {
        Alert.alert("Error", data.error || "Failed to update status");
      }
    } catch (error) {
      console.error("Error updating status:", error.message);
      Alert.alert("Error", "Failed to update incident status. Please try again.");
    }
  }, [stopAlertEffects, onClose]);

  useEffect(() => {
    if (!socket || !stationId || !userRole || !userId) return;

    const createHandler = () => {
      return async (incident) => {
        try {
          // Validate incident data
          if (!incident || typeof incident !== "object") {
            console.warn("Invalid incident data received");
            return;
          }

          // Safely extract and normalize incident data
          const safeIncident = {
            id: incident.id ?? incident.incident_id ?? null,
            incidentType: incident.incidentType ?? "Unknown",
            reporter_id: incident.user_id ?? incident.reporter_id ?? null,
            subType: incident.subType ?? "N/A",
            incidentDescription: incident.incidentDescription ?? "",
            incidentTime: incident.incidentTime ?? "N/A",
            location: incident.location ?? "Unknown",
            contactInfo: incident.contactInfo ?? "N/A",
            stationId: incident.stationId ?? stationId,
          };

          // Validate required fields
          if (!safeIncident.id || !safeIncident.stationId) {
            console.warn("Missing critical incident data");
            return;
          }

          // Skip alert if the reporter is the logged-in user
          if (safeIncident.reporter_id && String(safeIncident.reporter_id) === String(userId)) {
            return;
          }

          // Normalize and validate role
          const normalizedRole = String(userRole).toLowerCase().replace(/\s+/g, "_");
          if (normalizedRole !== "responder_head" && normalizedRole !== "responder_personnel") {
            return;
          }

          // Check if incident is for this station
          if (String(stationId) !== String(safeIncident.stationId)) {
            return;
          }

          // Update state
          setCurrentIncident(safeIncident);
          incidentRef.current = safeIncident;

          // Start alert effects (includes wake lock)
          await startAlertEffects();

          // Build alert message
          const alertMessage =
            `🚨 Incident Alert 🚨\n\n` +
            `Incident Type: ${safeIncident.incidentType}\n` +
            `Sub-Type: ${safeIncident.subType}\n` +
            (safeIncident.incidentType === "Others" ? `Description: ${safeIncident.incidentDescription}\n\n` : "") +
            `📍 Location: ${safeIncident.location}\n` +
            `🕒 Time Reported: ${safeIncident.incidentTime}\n` +
            `📞 Contact: ${safeIncident.contactInfo}`;

          // Show toast notification
          showToast(
            'error',
            `🚨 ${safeIncident.incidentType}`,
            `${safeIncident.subType} at ${safeIncident.location}`
          );

          // Show alert based on role
          if (normalizedRole === "responder_head" || (normalizedRole === "responder_personnel" && is_head)) {
            showAlert("New Incident", alertMessage, [
              {
                text: "Accept",
                onPress: async () => {
                  if (!incidentRef.current) return;
                  await handleStatusChange(incidentRef.current, incidentRef.current.stationId, "accepted");
                },
              },
              {
                text: "Decline",
                onPress: async () => {
                  if (!incidentRef.current) return;
                  await stopAlertEffects();
                  if (typeof showDeclineModal === "function") {
                    try {
                      showDeclineModal({
                        incident: incidentRef.current,
                        onSubmit: async (remarks) => {
                          await handleStatusChange(incidentRef.current, incidentRef.current.stationId, "declined", remarks);
                        },
                      });
                    } catch (error) {
                      console.error("Error showing decline modal:", error.message);
                    }
                  }
                },
              },
            ]);
          } else {
            showAlert("New Incident", alertMessage, [
              { text: "OK", onPress: async () => await stopAlertEffects() },
            ]);
          }

          // Add to incident list
          if (addIncidentToList && typeof addIncidentToList === "function") {
            try {
              addIncidentToList(safeIncident);
            } catch (error) {
              console.error("Error adding incident to list:", error.message);
            }
          }
        } catch (error) {
          console.error("Error handling incident:", error.message);
        }
      };
    };

    // Create handler with proper closure
    handlerRef.current = createHandler();

    // Remove old listener and attach new one
    socket.off(`user_${userId}_incident`);
    socket.on(`user_${userId}_incident`, handlerRef.current);

    // Cleanup on unmount
    return () => {
      if (handlerRef.current) {
        socket.off(`user_${userId}_incident`, handlerRef.current);
      }
    };
  }, [socket, stationId, userRole, userId, is_head, showAlert, showToast, addIncidentToList, startAlertEffects, stopAlertEffects, handleStatusChange]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Stop all alert effects
      stopAlertEffects();

      // Clear any pending timeouts
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }
    };
  }, [stopAlertEffects]);

  return { handleStatusChange, stopAlertEffects, currentIncident };
};
