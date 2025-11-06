import { SERVER_URL } from "@env";
import { useEffect, useState } from "react";
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

const RespondersModal = ({ visible, onClose, responders, incidentId, refreshData }) => {
  const [selectedRemarks, setSelectedRemarks] = useState("");
  const [remarksVisible, setRemarksVisible] = useState(false);
  const [declineModalVisible, setDeclineModalVisible] = useState(false);
  const [currentStationId, setCurrentStationId] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [isHead, setIsHead] = useState(false);
  const [userStationId, setUserStationId] = useState(null);
  //console.log("incidentId:", incidentId);
  useEffect(() => {
    const fetchUser = async () => {
      const role = await EncryptedStorage.getItem("role");
      const head = await EncryptedStorage.getItem("is_head");
      const station = await EncryptedStorage.getItem("station_id");
      setUserRole(role);
      setIsHead(head === "true");
      setUserStationId(Number(station))
    };
    fetchUser();
  }, []);

  const handleStatusChange = async (stationId, newStatus, remarksText = "") => {
    try {
      const token = await EncryptedStorage.getItem("token");
      console.log(`Updating status for station ID ${stationId} to ${newStatus} with remarks: ${remarksText}`);
      const response = await fetch(`${SERVER_URL}/incident/${incidentId}/station/${stationId}/status`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ acceptDecline: newStatus, remarks: remarksText }),
      });
      const data = await response.json();
      if (response.ok) {
        refreshData();
        Alert.alert(
          "Success",
          "Responder status updated successfully.",
          [{ text: "OK", onPress: onClose }],
          { cancelable: true }
        );

      } else {
        console.log(data.error);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDeclinePress = (stationId) => {
    setCurrentStationId(stationId);
    setSelectedRemarks("");
    setDeclineModalVisible(true);
  };

  const submitDecline = () => {
    if (!selectedRemarks || selectedRemarks.trim() === "") {
      Alert.alert("Error", "Remarks cannot be empty");
      return;
    }
    handleStatusChange(currentStationId, "decline", selectedRemarks);
    setDeclineModalVisible(false);
  };

  const renderStatus = (status) => {
    let color = "#9E9E9E";
    if (status === "accepted") color = "#4CAF50";
    if (status === "declined") color = "#F44336";
    return (
      <View style={[styles.statusTag, { backgroundColor: color }]}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    );
  };

  const openRemarks = (remarks) => {
    setSelectedRemarks(remarks || "No remarks available");
    setRemarksVisible(true);
  };
  const renderItem = ({ item }) => {
      console.log("station name" , item.station_name);
      const canChangeStatus =
      item.station_id === userStationId &&
      (userRole === "responder_head" || (userRole === "responder_personnel" && isHead));
      console.log(`Rendering item for station ID ${item.station_id}: canChangeStatus = ${canChangeStatus}`);
      console.log("station id ", item.station_id, " user station id ", userStationId);
    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.name}>{item.station_name}</Text>
          {renderStatus(item.acceptDecline)}
        </View>
        <Text style={styles.detail}>{item.address}</Text>
        {item.acceptDecline === "declined" &&(
          <TouchableOpacity>
            <View style={styles.doneNoticeBox}>
              <Text style={styles.doneNoticeTitle}>Your Station    [Declined]</Text>
              <Text style={styles.ongoingNoticeText}>
                Your station status if you want to Accept your current station status to this incident is "{item.acceptDecline}"
              </Text>
            </View>
          </TouchableOpacity>
        )}
        {item.acceptDecline === "accepted" &&(
          <TouchableOpacity>
            <View style={styles.doneNoticeBox}>
              <Text style={styles.doneNoticeTitle}>Your Station    [Accepted]</Text>
              <Text style={styles.ongoingNoticeText}>
                Your station status if you want to Decline your current station status to this incident is "{item.acceptDecline}"
              </Text>
            </View>
          </TouchableOpacity>
        )}
        {item.acceptDecline === "declined" && (
          <TouchableOpacity
            style={styles.remarksButton}
            onPress={() => openRemarks(item.remarks)}
          > 
            <Text style={styles.remarksButtonText}>View Remarks</Text>
          </TouchableOpacity>
        )}
        {canChangeStatus && (
          <View style={styles.buttonRow}>
            {item.acceptDecline==="declined" &&(
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#4CAF50" }]}
                onPress={() => handleStatusChange(item.station_id, "accepted")}
              >
                <Text style={styles.actionText}>Accept</Text>
              </TouchableOpacity>
            )}
            {item.acceptDecline === "accepted" &&(
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#F44336" }]}
                onPress={() => handleDeclinePress(item.station_id)}
              >
                <Text style={styles.actionText}>Decline</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      {/* Main Responders Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={visible}
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.container}>
            <Text style={styles.title}>Responder Stations</Text>
            <FlatList
              data={responders}
              keyExtractor={(item) => item.id.toString()}
              renderItem={renderItem}
              ListEmptyComponent={
                <Text style={styles.empty}>No responders assigned</Text>
              }
            />
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remarks Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={remarksVisible}
        onRequestClose={() => setRemarksVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.remarksContainer}>
            <Text style={styles.remarksTitle}>Responder Remarks</Text>
            <Text style={styles.remarksText}>{selectedRemarks}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setRemarksVisible(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Decline Remarks Input Modal */}
      <Modal
        animationType="fade"
        transparent
        visible={declineModalVisible}
        onRequestClose={() => setDeclineModalVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.remarksContainer}>
            <Text style={styles.remarksTitle}>Reason for Decline</Text>
            <TextInput
              placeholder="Enter remarks"
              style={styles.input}
              value={selectedRemarks}
              onChangeText={setSelectedRemarks}
              multiline
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#F44336" }]}
                onPress={submitDecline}
              >
                <Text style={styles.actionText}>Submit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#9E9E9E" }]}
                onPress={() => setDeclineModalVisible(false)}
              >
                <Text style={styles.actionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#fff",
    width: "85%",
    borderRadius: 15,
    padding: 20,
    maxHeight: "80%",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 15,
  },
  card: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
  },
  detail: {
    color: "#555",
    fontSize: 14,
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
    textTransform: "capitalize",
  },
  remarksButton: {
    backgroundColor: "#2196F3",
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 6,
  },
  remarksButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  actionText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  empty: {
    textAlign: "center",
    color: "#777",
    marginTop: 20,
  },
  closeBtn: {
    backgroundColor: "#2196F3",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 15,
  },
  closeText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  remarksContainer: {
    backgroundColor: "#fff",
    width: "80%",
    borderRadius: 12,
    padding: 20,
  },
  remarksTitle: {
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  remarksText: {
    fontSize: 15,
    color: "#333",
    textAlign: "center",
  },
  ongoingNoticeTitle: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#FF8C00',
  marginBottom: 4,
},
doneNoticeBox: {
  backgroundColor: '#FFF4E5',
  borderLeftWidth: 5,
  borderLeftColor: '#5cee49ff',
  padding: 10,
  borderRadius: 8,
  marginTop: 8,
},
doneNoticeTitle: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#22ec29ff',
  marginBottom: 4,
},
});

export default RespondersModal;
