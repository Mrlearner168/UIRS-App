import { SERVER_URL } from "@env";
import axios from "axios";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";

export default function DoneIncidentsScreen() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remark, setRemark] = useState({});
  const [activeTab, setActiveTab] = useState("pending");

  // Edit modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editIncidentId, setEditIncidentId] = useState(null);
  const [editRemarks, setEditRemarks] = useState("");

  // Image viewer states
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    fetchIncidents();
  }, []);

  // Check login token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (!storedToken) navigation.navigate("Login");
      } catch (error) {
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
  }, []);

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      const pendingRes = await axios.get(
        `${SERVER_URL}/incidents/done/unvalidated`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const postedRes = await axios.get(
        `${SERVER_URL}/incidents/done/validated`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const combinedData = [...pendingRes.data, ...postedRes.data];

      const updatedData = await Promise.all(
        combinedData.map(async (item) => {
          try {
            const [lat, lng] = item.location.split(",").map(Number);
            const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            const address = reverseGeocode[0]
              ? `${reverseGeocode[0].street || ""}, ${reverseGeocode[0].city || ""}, ${reverseGeocode[0].region || ""}, ${reverseGeocode[0].country || ""}`
              : item.location;

            let mediaArray = [];
            if (Array.isArray(item.media)) mediaArray = item.media;
            else if (typeof item.media === "string" && item.media.trim() !== "") mediaArray = [item.media];

            return { ...item, locationReadable: address, media: mediaArray };
          } catch {
            return {
              ...item,
              locationReadable: item.location,
              media: Array.isArray(item.media) ? item.media : [item.media],
            };
          }
        })
      );

      setIncidents(updatedData);
    } catch (err) {
      console.log("Error fetching incidents:", err);
      Alert.alert("Error", "Failed to fetch incidents");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchIncidents();
  };

  const submitRemark = async (incidentId) => {
    if (!remark[incidentId] || remark[incidentId].trim() === "") {
      Alert.alert("Notice❗", "Remark cannot be empty");
      return;
    }
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      const incident = incidents.find((i) => i.id === incidentId);

      await axios.post(
        `${SERVER_URL}/incidents/${incidentId}/remarks`,
        { remark: remark[incidentId], media: incident.media },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert("Success", "Remark added and incident validated");
      setRemark({ ...remark, [incidentId]: "" });
      fetchIncidents();
    } catch (err) {
      console.log("Error adding remark:", err.response?.data || err.message);
      Alert.alert("Error", "Failed to add remark");
    }
  };

  const openEditModal = (incident) => {
    setEditIncidentId(incident.id);
    setEditRemarks(incident.adminRemarks);
    setEditModalVisible(true);
  };

  const submitEdit = async () => {
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      await axios.put(
        `${SERVER_URL}/incidents/${editIncidentId}`,
        { adminRemarks: editRemarks },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert("Success", "Incident updated");
      fetchIncidents();
      setEditModalVisible(false);
    } catch (err) {
      console.log("Error editing incident:", err.response?.data || err.message);
      Alert.alert("Error", "Failed to edit incident");
    }
  };

  const deleteIncident = async (incidentId) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this incident?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await EncryptedStorage.getItem("token");
            if (!token) return;

            await axios.delete(`${SERVER_URL}/incidents/${incidentId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            Alert.alert("Success", "Incident deleted");
            fetchIncidents();
          } catch (err) {
            console.log("Error deleting incident:", err.response?.data || err.message);
            Alert.alert("Error", "Failed to delete incident");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading done incidents...</Text>
      </View>
    );
  }

  const filteredIncidents = incidents.filter((item) => {
    if (activeTab === "pending") {
      return (!item.adminRemarks || !item.adminRemarks.trim()) && (!item.validated || item.validated === false || item.validated === null);
    } else {
      return item.adminRemarks?.trim() && (item.validated === true || item.validated === 1);
    }
  });

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.heading}>Done Incidents</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginVertical: 10 }}>
        <TouchableOpacity
          onPress={() => setActiveTab("pending")}
          style={{ backgroundColor: activeTab === "pending" ? "#007AFF" : "#ccc", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Pending Post</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab("posted")}
          style={{ backgroundColor: activeTab === "posted" ? "#007AFF" : "#ccc", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Posted</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredIncidents}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text>No incidents available for this tab.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.incidentType}</Text>
            <Text style={styles.text}>Location: {item.locationReadable || item.location}</Text>
            <Text style={styles.text}>Reported Time: {item.incidentTime}</Text>
            <Text style={styles.date}>Created at: {item.created_at}</Text>

            {/* Images */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {item.media.map((img, idx) => (
                <View key={idx} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
                  {activeTab === "pending" && (
                    <TouchableOpacity
                      onPress={() => {
                        const updatedIncidents = incidents.map((incident) =>
                          incident.id === item.id
                            ? { ...incident, media: incident.media.filter((_, i) => i !== idx) }
                            : incident
                        );
                        setIncidents(updatedIncidents);
                      }}
                      style={styles.removeButton}
                    >
                      <Text style={{ color: "white", fontWeight: "bold" }}>X</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      setViewerImages(item.media.map((m) => ({ uri: `${SERVER_URL}${m}` })));
                      setViewerIndex(idx);
                      setImageViewerVisible(true);
                    }}
                  >
                    <Image
                      source={{ uri: `${SERVER_URL}${img}` }}
                      style={{ width: 100, height: 100, borderRadius: 6 }}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {item.adminRemarks ? (
              <Text style={styles.remarks}>Admin Remarks: {item.adminRemarks}</Text>
            ) : (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder="Add remark..."
                  value={remark[item.id] || ""}
                  onChangeText={(text) => setRemark({ ...remark, [item.id]: text })}
                />
                <TouchableOpacity onPress={() => submitRemark(item.id)} style={styles.button}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Submit Remark</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "posted" && (
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.button}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => deleteIncident(item.id)} style={styles.delbutton}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: 300, padding: 20, backgroundColor: "#fff", borderRadius: 10 }}>
            <Text>Edit Remarks</Text>
            <TextInput value={editRemarks} onChangeText={setEditRemarks} style={{ borderWidth: 1, padding: 8, marginVertical: 10 }} />
            <TouchableOpacity onPress={submitEdit} style={styles.button}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>Submit Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.delbutton}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Viewer */}
      <ImageViewing
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={imageViewerVisible}
        onRequestClose={() => setImageViewerVisible(false)}
        presentationStyle="overFullScreen"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 5, marginTop: 20, textAlign: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#f8f8f8",
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  button: {
    backgroundColor: "green",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    marginLeft: 8,
    marginTop: 8,
  },
  delbutton: {
    backgroundColor: "red",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    marginLeft: 8,
    marginTop: 8,
  },
  removeButton: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "red",
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  text: { fontSize: 14, marginBottom: 4 },
  remarks: { fontSize: 16, marginTop: 6, marginBottom: 10, fontStyle: "italic", color: "darkred" },
  date: { fontSize: 12, marginTop: 6, color: "gray" },
  input: { borderWidth: 1, borderRadius: 6, padding: 8, marginVertical: 8, backgroundColor: "#fff" },
});
