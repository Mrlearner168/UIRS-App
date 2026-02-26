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
import Icon from "react-native-vector-icons/MaterialIcons";

export default function DoneIncidentsScreen({ navigation }) {
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
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (!storedToken) navigation.navigate("Login");
      } catch {
        Alert.alert("Error", "Failed to fetch authentication token.");
      }
    };
    fetchToken();
    fetchIncidents();
  }, []);

  const getMediaArray = (media) => {
    if (Array.isArray(media)) return media.filter(m => typeof m === "string" && m.trim() !== "");
    if (typeof media === "string" && media.trim() !== "") return media.split(',').map(s => s.trim());
    return [];
  };

  const fetchIncidents = async () => {
    if (!refreshing) setLoading(true);
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      const pendingRes = await axios.get(`${SERVER_URL}/incidents/done/unvalidated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const postedRes = await axios.get(`${SERVER_URL}/incidents/done/validated`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Tag source for easier filtering later if needed, though validated field covers it
      const pendingData = pendingRes.data.map(item => ({ ...item, validated: false }));
      const postedData = postedRes.data.map(item => ({ ...item, validated: true }));

      const combinedData = [...pendingData, ...postedData];

      // Geocoding and Media Processing
      const updatedData = await Promise.all(
        combinedData.map(async (item) => {
          let address = item.location;
          try {
            const [lat, lng] = item.location.split(",").map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
               const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
               if (reverseGeocode && reverseGeocode.length > 0) {
                   const { street, city, region, country } = reverseGeocode[0];
                   address = `${street || ""}, ${city || ""}, ${region || ""}, ${country || ""}`.replace(/^, /, "").replace(/, ,/g, ",");
               }
            }
          } catch (e) {
            // keep original location on error
          }

          const mediaArray = getMediaArray(item.media);
          
          // Only update media state if not already set to preserve local deletions before submit
          setIncidentMediaState(prev => {
              if (prev[item.id]) return prev; // Don't overwrite if exists
              return { ...prev, [item.id]: [...mediaArray] };
          });

          return { ...item, locationReadable: address, media: mediaArray };
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
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
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

  // Filter based on Tab
  const filteredIncidents = incidents.filter((item) => {
    if (activeTab === "pending") {
      // Pending tab: Not validated OR validated is false
      return !item.validated; 
    } else {
      // Posted tab: Validated is true
      return item.validated;
    }
  });

  const renderCard = ({ item }) => {
      const mediaList = incidentMediaState[item.id] || [];
      
      return (
        <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.incidentTitle}>{item.incidentType}</Text>
                    <Text style={styles.dateText}>{t('createdat')} {new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.statusBadge, activeTab === 'posted' ? styles.badgeSuccess : styles.badgePending]}>
                    <Text style={[styles.statusText, activeTab === 'posted' ? styles.textSuccess : styles.textPending]}>
                        {activeTab === 'posted' ? 'POSTED' : 'PENDING'}
                    </Text>
                </View>
            </View>

            {/* Info */}
            <View style={styles.infoContainer}>
                <View style={styles.infoRow}>
                    <Icon name="location-on" size={18} color="#6B7280" />
                    <Text style={styles.infoText}>{item.locationReadable || item.location}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Icon name="access-time" size={18} color="#6B7280" />
                    <Text style={styles.infoText}>{t('reportedtime')} {item.incidentTime}</Text>
                </View>
            </View>

            {/* Media Gallery */}
            <View style={styles.mediaSection}>
                <Text style={styles.sectionTitle}>{t('media') || "Media Evidence"}</Text>
                {mediaList.length > 0 ? (
                    <View style={styles.mediaRow}>
                        {mediaList.map((img, idx) => (
                            <View key={`${item.id}-${idx}`} style={styles.imageContainer}>
                                <TouchableOpacity
                                    onPress={() => {
                                        const formatted = mediaList.map(m => ({ uri: m.startsWith('http') ? m : `${SERVER_URL}${m}` }));
                                        setViewerImages(formatted);
                                        setViewerIndex(idx);
                                        setImageViewerVisible(true);
                                    }}
                                >
                                    <Image
                                        source={{ uri: img.startsWith('http') ? img : `${SERVER_URL}${img}` }}
                                        style={styles.thumbnail}
                                    />
                                </TouchableOpacity>
                                {activeTab === "pending" && (
                                    <TouchableOpacity
                                        style={styles.removeBtn}
                                        onPress={() => removeImage(item.id, idx)}
                                    >
                                        <Icon name="close" size={14} color="#fff" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                    </View>
                ) : (
                    <Text style={styles.noMediaText}>{t('noimages') || 'No images attached'}</Text>
                )}
            </View>

            {/* Action Area */}
            <View style={styles.actionArea}>
                {activeTab === "pending" ? (
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder={t('addremarks') || "Add remarks..."}
                            placeholderTextColor="#9CA3AF"
                            multiline
                            value={remark[item.id] || ""}
                            onChangeText={(text) => setRemark({ ...remark, [item.id]: text })}
                        />
                        <TouchableOpacity style={styles.submitBtn} onPress={() => submitRemark(item.id)}>
                            <Text style={styles.submitBtnText}>{t('post') || "Post"}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View>
                        <Text style={styles.remarksLabel}>{t('adminremarks')}:</Text>
                        <Text style={styles.remarksText}>{item.adminRemarks}</Text>
                        
                        <View style={styles.buttonRow}>
                            <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                                <Icon name="edit" size={16} color="#007BFF" />
                                <Text style={styles.editBtnText}>{t('editremarks')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteIncident(item.id)}>
                                <Icon name="delete" size={16} color="#EF4444" />
                                <Text style={styles.deleteBtnText}>{t('delete')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>
        </View>
      );
  };

  return (
    <View style={styles.container}>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab("pending")}
          style={[styles.tab, activeTab === "pending" && styles.activeTab]}
        >
          <Text style={[styles.tabText, activeTab === "pending" && styles.activeTabText]}>{t('pendingpost')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab("posted")}
          style={[styles.tab, activeTab === "posted" && styles.activeTab]}
        >
          <Text style={[styles.tabText, activeTab === "posted" && styles.activeTabText]}>{t('posted')}</Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={styles.loadingText}>{t('loadingdone')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredIncidents}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={renderCard}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="assignment-turned-in" size={60} color="#D1D5DB" />
              <Text style={styles.emptyText}>{t('noincidents') || "No incidents found"}</Text>
            </View>
          }
        />
      )}

      {/* Edit Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('editremarks')}</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Icon name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
            </View>
            
            <TextInput
                value={editRemarks}
                onChangeText={setEditRemarks}
                style={styles.modalInput}
                multiline
                placeholder={t('editremarks')}
            />
            
            <View style={styles.modalFooter}>
                <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalCancelBtn}>
                    <Text style={styles.modalCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitEdit} style={styles.modalSaveBtn}>
                    <Text style={styles.modalSaveText}>{t('submitedit')}</Text>
                </TouchableOpacity>
            </View>
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
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  
  // Header
  headerContainer: { padding: 22, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1F2937' },

  // Tabs
  tabsContainer: { flexDirection: "row", margin: 16, backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeTab: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabText: { fontWeight: "600", color: '#6B7280' },
  activeTabText: { color: '#007BFF' },

  // Loading & Empty
  centerLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: '#6B7280' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 10, fontSize: 16, color: '#9CA3AF' },

  // Card
  card: { backgroundColor: "#fff", borderRadius: 16, marginHorizontal: 16, marginBottom: 16, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  incidentTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  dateText: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeSuccess: { backgroundColor: '#D1FAE5' },
  statusText: { fontSize: 11, fontWeight: '700' },
  textPending: { color: '#D97706' },
  textSuccess: { color: '#059669' },

  // Info
  infoContainer: { marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { fontSize: 14, color: '#4B5563', marginLeft: 8, flex: 1 },

  // Media
  mediaSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase' },
  mediaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  imageContainer: { position: 'relative' },
  thumbnail: { width: 160, height: 160, borderRadius: 8, backgroundColor: '#F3F4F6' },
  removeBtn: { position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#fff' },
  noMediaText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },

  // Action Area
  actionArea: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  
  // Input (Pending Tab)
  inputWrapper: { gap: 10 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, backgroundColor: '#F9FAFB', minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: '#007BFF', padding: 12, borderRadius: 8, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700' },

  // Posted View
  remarksLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  remarksText: { fontSize: 15, color: '#1F2937', marginBottom: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: '#EFF6FF', borderRadius: 8 },
  editBtnText: { color: '#007BFF', fontWeight: '600', fontSize: 13 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: '#FEF2F2', borderRadius: 8 },
  deleteBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalInput: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, backgroundColor: '#F9FAFB', minHeight: 100, textAlignVertical: 'top', marginBottom: 20 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { padding: 12, borderRadius: 8, backgroundColor: '#F3F4F6' },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalSaveBtn: { padding: 12, borderRadius: 8, backgroundColor: '#007BFF' },
  modalSaveText: { color: '#fff', fontWeight: '600' },
});