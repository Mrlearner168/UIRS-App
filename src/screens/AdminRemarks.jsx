import { SERVER_URL } from "@env";
import axios from "axios";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

  // Track remaining media per incident
  const [incidentMediaState, setIncidentMediaState] = useState({});

  const { t } = useTranslation();

  useEffect(() => {
    fetchIncidents();
  }, []);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (!storedToken) navigation.navigate("Login");
      } catch {
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
  }, []);

  const getMediaArray = (media) => {
    if (Array.isArray(media)) return media.filter(m => typeof m === "string" && m.trim() !== "");
    if (typeof media === "string" && media.trim() !== "") return [media];
    return [];
  };

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      const pendingRes = await axios.get(`${SERVER_URL}/incidents/done/unvalidated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const postedRes = await axios.get(`${SERVER_URL}/incidents/done/validated`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const combinedData = [...pendingRes.data, ...postedRes.data];

      const updatedData = await Promise.all(
        combinedData.map(async (item) => {
          try {
            const [lat, lng] = item.location.split(",").map(Number);
            const address = !isNaN(lat) && !isNaN(lng)
              ? ((await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }))[0]
                ? `${reverseGeocode[0].street || ""}, ${reverseGeocode[0].city || ""}, ${reverseGeocode[0].region || ""}, ${reverseGeocode[0].country || ""}`
                : item.location)
              : item.location;

            const mediaArray = getMediaArray(item.media);

            setIncidentMediaState(prev => ({ ...prev, [item.id]: [...mediaArray] }));

            return { ...item, locationReadable: address, media: mediaArray };
          } catch {
            const mediaArray = getMediaArray(item.media);
            setIncidentMediaState(prev => ({ ...prev, [item.id]: [...mediaArray] }));
            return { ...item, locationReadable: item.location, media: mediaArray };
          }
        })
      );

      setIncidents(updatedData);
    } catch (err) {
      console.error("Failed to fetch incidents:", err);
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

  const removeImage = (incidentId, imageIndex) => {
    Alert.alert(
      t('confirm') || 'Confirm',
      t('confirmremoveimage') || 'Are you sure you want to remove this image?',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: () => {
            setIncidentMediaState(prev => {
              const updated = [...prev[incidentId]];
              updated.splice(imageIndex, 1);
              return { ...prev, [incidentId]: updated };
            });
          }
        }
      ]
    );
  };

  const submitRemark = async (incidentId) => {
    if (!remark[incidentId] || remark[incidentId].trim() === "") {
      Alert.alert("Notice❗", t('remarksempty'));
      return;
    }
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return Alert.alert("Error", t('authentication_failed') || 'Authentication failed');

      const remainingMedia = incidentMediaState[incidentId] || [];
      const mediaString = remainingMedia.join(',');
      console.log("Submitting remark with media:", mediaString);
      await axios.post(
        `${SERVER_URL}/incidents/${incidentId}/remarks`,
        { remark: remark[incidentId], media: mediaString },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert("Success", t('remarksadded'));
      setRemark({ ...remark, [incidentId]: "" });
      fetchIncidents();
    } catch (err) {
      console.error("Error adding remark:", err);
      const errorMsg = err.response?.data?.message || err.message || t('failedremarks');
      Alert.alert("Error", errorMsg);
    }
  };

  const openEditModal = (incident) => {
    setEditIncidentId(incident.id);
    setEditRemarks(incident.adminRemarks);
    setEditModalVisible(true);
  };

  const submitEdit = async () => {
    if (!editRemarks || editRemarks.trim() === "") {
      Alert.alert("Notice❗", t('remarksempty') || 'Remarks cannot be empty');
      return;
    }

    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) {
        Alert.alert("Error", t('authentication_failed') || 'Authentication failed');
        return;
      }

      await axios.put(
        `${SERVER_URL}/incidents/${editIncidentId}`,
        { adminRemarks: editRemarks },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Alert.alert("Success", t('incidentupdated'));
      fetchIncidents();
      setEditModalVisible(false);
      setEditRemarks("");
    } catch (err) {
      console.error("Error editing incident:", err);
      const errorMsg = err.response?.data?.message || err.message || t('failedupdate');
      Alert.alert("Error", errorMsg);
    }
  };

  const deleteIncident = async (incidentId) => {
    Alert.alert("Confirm Delete", t('confirmdelincident'), [
      { text: t('cancel'), style: "cancel" },
      {
        text: t('delete'),
        style: "destructive",
        onPress: async () => {
          try {
            const token = await EncryptedStorage.getItem("token");
            if (!token) return Alert.alert("Error", t('authentication_failed') || 'Authentication failed');

            await axios.delete(`${SERVER_URL}/incidents/${incidentId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            Alert.alert("Success", t('incidentdeleted') || "Incident deleted");
            fetchIncidents();
          } catch (err) {
            console.error("Error deleting incident:", err);
            const errorMsg = err.response?.data?.message || err.message || t('failedupdated');
            Alert.alert("Error", errorMsg);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>{t('loadingdone')}</Text>
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
      <Text style={styles.heading}>{t('doneincident')}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-evenly", marginVertical: 10 }}>
        <TouchableOpacity
          onPress={() => setActiveTab("pending")}
          style={{ backgroundColor: activeTab === "pending" ? "#007AFF" : "#ccc", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('pendingpost')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("posted")}
          style={{ backgroundColor: activeTab === "posted" ? "#007AFF" : "#ccc", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('posted')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredIncidents}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text>{t('noincidents')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.incidentType}</Text>
            <Text style={styles.text}>{t('location')}{item.processLocation || item.locationReadable}</Text>
            <Text style={styles.text}>{t('reportedtime')} {item.incidentTime}</Text>
            <Text style={styles.date}>{t('createdat')} {item.created_at}</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {incidentMediaState[item.id] && incidentMediaState[item.id].length > 0 ? (
                incidentMediaState[item.id].map((img, idx) => (
                  <View key={`${item.id}-${idx}`} style={{ position: "relative", marginRight: 8, marginBottom: 8 }}>
                    {activeTab === "pending" && (
                      <TouchableOpacity
                        onPress={() => removeImage(item.id, idx)}
                        style={styles.removeButton}
                      >
                        <Text style={{ color: "white", fontWeight: "bold", fontSize: 16 }}>×</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        const imageUris = incidentMediaState[item.id].map(m => ({ uri: m.startsWith('http') ? m : `${SERVER_URL}${m}` }));
                        setViewerImages(imageUris);
                        setViewerIndex(idx);
                        setImageViewerVisible(true);
                      }}
                    >
                      <Image
                        source={{ uri: img.startsWith('http') ? img : `${SERVER_URL}${img}` }}
                        style={{ width: 100, height: 100, borderRadius: 6 }}
                      />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <Text style={{ color: '#888', fontSize: 12, marginVertical: 8 }}>
                  {t('noimages') || 'No images'}
                </Text>
              )}
            </View>

            {item.adminRemarks ? (
              <Text style={styles.remarks}>{t('adminremarks')} {item.adminRemarks}</Text>
            ) : (
              <View>
                <TextInput
                  style={styles.input}
                  placeholder={t('addremarks')}
                  placeholderTextColor={"#888"}
                  value={remark[item.id] || ""}
                  onChangeText={(text) => setRemark({ ...remark, [item.id]: text })}
                />
                <TouchableOpacity onPress={() => submitRemark(item.id)} style={styles.button}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('submitremark')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "posted" && (
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <TouchableOpacity onPress={() => openEditModal(item)} style={styles.button}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('editremarks')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteIncident(item.id)} style={styles.delbutton}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('delete')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ width: 300, padding: 20, backgroundColor: "#fff", borderRadius: 10 }}>
            <Text>{t('editremarks')}</Text>
            <TextInput value={editRemarks} onChangeText={setEditRemarks} style={{ borderWidth: 1, padding: 8, marginVertical: 10 }} />
            <TouchableOpacity onPress={submitEdit} style={styles.button}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('submitedit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.delbutton}>
              <Text style={{ color: "#fff", fontWeight: "bold" }}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    top: -8,
    right: -8,
    backgroundColor: "red",
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  text: { fontSize: 14, marginBottom: 4 },
  remarks: { fontSize: 16, marginTop: 6, marginBottom: 10, fontStyle: "italic", color: "darkred" },
  date: { fontSize: 12, marginTop: 6, color: "gray" },
  input: { borderWidth: 1, borderRadius: 6, padding: 8, marginVertical: 8, backgroundColor: "#fff" , color: "#000"},
});