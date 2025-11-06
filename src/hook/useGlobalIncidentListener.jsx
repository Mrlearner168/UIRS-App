import { SERVER_URL } from "@env";
import { Audio } from "expo-av";
import { useContext, useEffect, useRef, useState } from "react";
import { Alert, Vibration } from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import showDeclineModal from "../components/DeclineModal";
import { AuthContext } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";

export const useGlobalIncidentListener = (addIncidentToList) => {
  const { socket } = useSocket();
  const { showAlert } = useToast();
  const { authData } = useContext(AuthContext);

  const soundRef = useRef(null);
  const vibrationRef = useRef(null);

  const stationId = authData?.stationId;
  const userRole = authData?.role;
  const userId = authData?.id;
  const is_head = authData?.is_head;

  const [currentIncident, setCurrentIncident] = useState(null);
  const incidentRef = useRef(null);

  const startAlertEffects = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        require("../../assets/alert.mp3"),
        { shouldPlay: true, isLooping: true }
      );
      soundRef.current = sound;
      vibrationRef.current = setInterval(() => Vibration.vibrate([400, 400]), 800);
    } catch (e) {
      console.log("Error starting alert effects:", e);
    }
  };

  const stopAlertEffects = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }
      Vibration.cancel();
    } catch (e) {
      console.log("Error stopping alert effects:", e);
    }
  };

  const onClose = (incident) => {
    if (!incident) return;
    console.log("Closing modal for incident:", incident.incidentType);
  };

  const handleStatusChange = async (incident, stationIdParam, newStatus, remarksText = "") => {
    try {
      await stopAlertEffects();
      const token = await EncryptedStorage.getItem("token");

      console.log("=== INCIDENT STATUS UPDATE ===");
      console.log("Station ID:", stationIdParam);
      console.log("Reporter ID from incident:", incident.reporter_id);
      console.log("Logged-in User ID:", userId);
      console.log("Comparison result:", String(incident.reporter_id) === String(userId));
      console.log("Incident ID:", incident?.id || "No incident selected");
      console.log("Status Selected:", newStatus);
      if (newStatus === "decline") console.log("Remarks:", remarksText);
      console.log("==============================");

      const response = await fetch(
        `${SERVER_URL}/incident/${incident.id}/station/${stationIdParam}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ acceptDecline: newStatus, remarks: remarksText }),
        }
      );

      const data = await response.json();
      if (response.ok) {
        Alert.alert("Success", "Responder status updated successfully.", [
          { text: "OK", onPress: () => onClose(currentIncident) },
        ]);
      } else {
        console.log("Error response:", data.error);
      }
    } catch (error) {
      console.log("Error updating status:", error);
    }
  };

  useEffect(() => {
    if (!socket || !stationId || !userRole || !userId) return;

    const handler = async (incident) => {
      if (!incident || typeof incident !== "object") return;

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

      // Skip alert if the reporter is the logged-in user
      if (safeIncident.reporter_id && String(safeIncident.reporter_id) === String(userId)) {
        console.log("Incident reported by self, skipping alert");
        return;
      }

      setCurrentIncident(safeIncident);
      incidentRef.current = safeIncident;

      const normalizedRole = String(userRole).toLowerCase().replace(/\s+/g, "_");
      if (normalizedRole !== "responder_head" && normalizedRole !== "responder_personnel") return;
      if (String(stationId) !== String(safeIncident.stationId)) return;

      await startAlertEffects();

      const alertMessage =
        `🚨 Incident Alert 🚨\n\n` +
        `Incident Type: ${safeIncident.incidentType}\n` +
        `Sub-Type: ${safeIncident.subType}\n` +
        (safeIncident.incidentType === "Others" ? `Description: ${safeIncident.incidentDescription}\n\n` : "") +
        `📍 Location: ${safeIncident.location}\n` +
        `🕒 Time Reported: ${safeIncident.incidentTime}\n` +
        `📞 Contact: ${safeIncident.contactInfo}`;

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
                showDeclineModal({
                  incident: incidentRef.current,
                  onSubmit: async (remarks) => {
                    await handleStatusChange(incidentRef.current, incidentRef.current.stationId, "declined", remarks);
                  },
                });
              }
            }
          }
        ]);
      } else {
        showAlert("New Incident", alertMessage, [
          { text: "OK", onPress: async () => await stopAlertEffects() },
        ]);
      }

      if (addIncidentToList && typeof addIncidentToList === "function") {
        addIncidentToList(safeIncident);
      }
    };

    socket.off(`user_${userId}_incident`);
    socket.on(`user_${userId}_incident`, handler);

    return () => {
      socket.off(`user_${userId}_incident`, handler);
    };
  }, [socket, stationId, userRole, userId, is_head, showAlert, addIncidentToList]);

  return { handleStatusChange, stopAlertEffects, currentIncident };
};
