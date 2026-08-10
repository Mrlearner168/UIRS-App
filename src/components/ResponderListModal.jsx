import { SERVER_URL } from "@env";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";

// ==========================================
// 1. Reusable UI Components
// ==========================================

const StatusBadge = ({ status }) => {
  const normalizedStatus = status?.toLowerCase() || "pending";
  let backgroundColor = "#6B7280"; // Gray (Unknown)
  let textColor = "#FFFFFF";
  let label = "Unknown";

  if (normalizedStatus === "accepted") {
    backgroundColor = "#10B981"; // Emerald Green
    label = "Accepted";
  } else if (normalizedStatus === "declined") {
    backgroundColor = "#EF4444"; // Red
    label = "Declined";
  } else if (normalizedStatus === "pending" || normalizedStatus === "") {
    backgroundColor = "#F59E0B"; // Orange
    label = "Pending";
  }

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
};

const StationCard = ({ item, isOwnStation, canManageStation, onAccept, onDeclinePress }) => {
  const { t } = useTranslation();
  const status = item.acceptDecline?.toLowerCase() || "pending";
  const isAccepted = status === "accepted";
  const isDeclined = status === "declined";
  const isPending = status === "pending" || status === "";

  return (
    <View style={[styles.card, isOwnStation && styles.ownStationCard]}>
      {/* Header: Station Name & Status */}
      <View style={styles.cardHeader}>
        <View style={styles.stationTitleContainer}>
          <Text style={styles.stationIcon}>🏢</Text>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.stationName} numberOfLines={1}>
                {item.station_name}
              </Text>
            </View>
            {isOwnStation && (
              <View style={styles.yourStationTag}>
                <Text style={styles.yourStationText}>{t("your_station") || "Your Station"}</Text>
              </View>
            )}
          </View>
        </View>
        <StatusBadge status={status} />
      </View>

      {/* Body: Address */}
      <View style={styles.cardBody}>
        <Text style={styles.addressLabel}>Address:</Text>
        <Text style={styles.addressText}>{item.address}</Text>
      </View>

      {/* Inline Remarks (Visible to everyone if declined) */}
      {isDeclined && item.remarks && (
        <View style={styles.remarksBox}>
          <Text style={styles.remarksTitle}>Decline Reason:</Text>
          <Text style={styles.remarksText}>{item.remarks}</Text>
        </View>
      )}

      {/* Action Buttons (Strictly for Own Station & Authorized Roles) */}
      {canManageStation && (
        <View style={styles.actionContainer}>
          {(isPending || isDeclined) && (
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              onPress={() => onAccept(item.station_id)}
            >
              <Text style={styles.btnText}>Accept Dispatch</Text>
            </TouchableOpacity>
          )}

          {(isPending || isAccepted) && (
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline]}
              onPress={() => onDeclinePress(item.station_id)}
            >
              <Text style={styles.btnText}>Decline</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const DeclineModal = ({ visible, onClose, onSubmit, remarks, setRemarks }) => {
  const { t } = useTranslation();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Decline Dispatch</Text>
          <Text style={styles.modalSubtitle}>Please provide a mandatory reason for declining.</Text>
          
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Currently responding to another emergency..."
            placeholderTextColor="#9CA3AF"
            value={remarks}
            onChangeText={setRemarks}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.modalActionRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.btnTextCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnDecline, { flex: 1, marginLeft: 10 }]} onPress={onSubmit}>
              <Text style={styles.btnText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ==========================================
// 2. Main Component
// ==========================================

const RespondersModal = ({ visible, onClose, responders, incidentId, refreshData }) => {
  const [userRole, setUserRole] = useState("");
  const [isHead, setIsHead] = useState(false);
  const [userStationId, setUserStationId] = useState(null);
  
  // Decline Flow State
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [currentStationId, setCurrentStationId] = useState(null);
  const [declineRemarks, setDeclineRemarks] = useState("");

  const { t } = useTranslation();

  useEffect(() => {
    const fetchUser = async () => {
      const role = await EncryptedStorage.getItem("role");
      const head = await EncryptedStorage.getItem("is_head");
      const station = await EncryptedStorage.getItem("station_id");
      setUserRole(role);
      setIsHead(head === "true");
      setUserStationId(Number(station));
    };
    fetchUser();
  }, []);

  const handleStatusChange = async (stationId, newStatus, remarksText = "") => {
    try {
      const token = await EncryptedStorage.getItem("token");
      const response = await fetch(`${SERVER_URL}/incident/${incidentId}/station/${stationId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ acceptDecline: newStatus, remarks: remarksText }),
      });
      
      if (response.ok) {
        refreshData();
        Alert.alert("Status Updated", `Station dispatch has been marked as ${newStatus}.`);
      } else {
        const data = await response.json();
        Alert.alert("Error", data.error || "Failed to update status.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not reach the server.");
    }
  };

  const onAccept = (stationId) => {
    handleStatusChange(stationId, "accepted", "");
  };

  const onDeclinePress = (stationId) => {
    setCurrentStationId(stationId);
    setDeclineRemarks("");
    setDeclineModalVisible(true);
  };

  const submitDecline = () => {
    if (!declineRemarks || declineRemarks.trim() === "") {
      Alert.alert("Required", "You must provide a reason for declining.");
      return;
    }
    handleStatusChange(currentStationId, "declined", declineRemarks.trim());
    setDeclineModalVisible(false);
  };

  return (
    <>
      <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.mainContainer}>
            
            <View style={styles.header}>
              <Text style={styles.title}>Dispatch Dashboard</Text>
              <Text style={styles.subtitle}>Track responder station statuses</Text>
            </View>

            <FlatList
              data={responders}
              keyExtractor={(item) => item.station_id.toString()}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isOwnStation = item.station_id === userStationId;
                const canManageStation = isOwnStation && (userRole === "responder_head" || (userRole === "responder_personnel" && isHead));
                
                return (
                  <StationCard 
                    item={item} 
                    isOwnStation={isOwnStation} 
                    canManageStation={canManageStation}
                    onAccept={onAccept}
                    onDeclinePress={onDeclinePress}
                  />
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{t('noresponders') || "No stations assigned to this incident."}</Text>
                </View>
              }
            />

            <View style={styles.footer}>
              <TouchableOpacity style={styles.btnClose} onPress={onClose}>
                <Text style={styles.btnCloseText}>Close Dashboard</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>

      <DeclineModal 
        visible={declineModalVisible} 
        onClose={() => setDeclineModalVisible(false)} 
        onSubmit={submitDecline}
        remarks={declineRemarks}
        setRemarks={setDeclineRemarks}
      />
    </>
  );
};

// ==========================================
// 3. StyleSheet (Modern Dispatch Theme)
// ==========================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.7)", // Darker, professional backdrop
    justifyContent: "flex-end", // Slide up from bottom feel
  },
  mainContainer: {
    backgroundColor: "#F3F4F6", // Light gray dashboard background
    width: "100%",
    height: "85%", // Tall enough for lists
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 2, // Subtle shadow for Android
    shadowColor: "#000", // Subtle shadow for iOS
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  ownStationCard: {
    borderColor: "#3B82F6", // Highlight border for own station
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  stationTitleContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 10,
  },
  stationIcon: {
    fontSize: 22,
    marginRight: 10,
    marginTop: 2,
  },
  stationName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    flexShrink: 1,
  },
  yourStationTag: {
    backgroundColor: "#DBEAFE", // Light blue
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  yourStationText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1D4ED8",
    textTransform: "uppercase",
  },
  cardBody: {
    marginBottom: 12,
  },
  addressLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  addressText: {
    fontSize: 14,
    color: "#4B5563",
    marginTop: 2,
  },
  remarksBox: {
    backgroundColor: "#FEF2F2", // Light red bg
    borderLeftWidth: 3,
    borderLeftColor: "#EF4444",
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  remarksTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 2,
  },
  remarksText: {
    fontSize: 14,
    color: "#7F1D1D",
    fontStyle: "italic",
  },
  actionContainer: {
    flexDirection: "row",
    gap: 10, // RN 0.71+ supports gap
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAccept: {
    backgroundColor: "#10B981",
    flex: 1,
  },
  btnDecline: {
    backgroundColor: "#EF4444",
    flex: 1,
  },
  btnCancel: {
    backgroundColor: "#E5E7EB",
  },
  btnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  btnTextCancel: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 14,
  },
  footer: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  btnClose: {
    backgroundColor: "#1F2937",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnCloseText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    width: "90%",
    borderRadius: 16,
    padding: 24,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    height: 100,
    fontSize: 15,
    color: "#111827",
    marginBottom: 20,
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 16,
    fontStyle: "italic",
  },
});

export default RespondersModal;