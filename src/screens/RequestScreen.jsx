import { SERVER_URL } from '@env';
import axios from "axios";
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from 'react-native-encrypted-storage';
import ImageViewing from "react-native-image-viewing";
import Icon from "react-native-vector-icons/MaterialIcons";

const RequestScreen = () => {
  const [requests, setRequests] = useState([]);
  const [token, setToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Global loading state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");

  // new states for image viewer
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [imageLoadingState, setImageLoadingState] = useState({});
  
  const { t } = useTranslation();
  const pendingRequestsRef = useRef({}); // Prevent duplicate requests

  // Image loading and error handling
  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: false, loaded: true }
    }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: true, loaded: false }
    }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const setImageLoading = useCallback((uri, loading) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { ...prev[uri], loading }
    }));
  }, []);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) setToken(storedToken);
      } catch (error) {
        console.log("Error fetching token:", error);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (token) fetchRequests();
  }, [token]);

  const fetchRequests = async () => {
    // Only show full loading indicator if not refreshing
    if (!refreshing) setIsLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/role_requests_status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(res.data);
    } catch (err) {
      console.log(err);
      Alert.alert("Error", t('fetchfailed') || "Failed to fetch requests");
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (request) => {
    setSelectedRequest(request);
    setModalVisible(true);
  };

  const confirmAction = (request, action) => {
    Alert.alert(
      t('confirmaction') || "Confirm Action",
      `${t('areyousure') || "Are you sure you want to"} ${action} ${t('thisrequest') || "this request"}?`,
      [
        { text: t('cancel'), style: "cancel" },
        { 
          text: t('confirm'), 
          onPress: () => handleAction(request, action),
          style: action === "declined" ? "destructive" : "default"
        }
      ]
    );
  };

  const handleAction = async (request, action) => {
    try {
      await axios.put(`${SERVER_URL}/validate_role_request/${request.request_id}`, {
        action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert("Success", `Request ${action} successfully.`);
      await fetchRequests();
      setModalVisible(false);
    } catch (err) {
      console.log(err);
      Alert.alert("Error", `Failed to ${action} request.`);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const renderStatusButtons = () => {
    const statuses = ["pending", "accepted", "declined"];
    
    return (
      <View style={styles.tabContainer}>
        {statuses.map((status) => {
          const isActive = statusFilter === status;
          let activeColor = "#007BFF";
          if (status === 'accepted') activeColor = "#10B981";
          if (status === 'declined') activeColor = "#EF4444";

          return (
            <TouchableOpacity
              key={status}
              style={[
                styles.tab,
                isActive ? { backgroundColor: activeColor, borderColor: activeColor } : { backgroundColor: '#fff', borderColor: '#E5E7EB' }
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.tabText, { color: isActive ? '#fff' : '#6B7280' }]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const filteredRequests = requests.filter(req => req.status === statusFilter);

  // helper to open viewer
  const openImageViewer = (images, index) => {
    // Filter out invalid or null images before opening viewer
    const validImages = images.filter(uri => uri).map(uri => ({ uri }));
    if (validImages.length > 0) {
        setViewerImages(validImages);
        setViewerIndex(index);
        setImageViewerVisible(true);
    }
  };

  const renderImageWithLoader = (uri, index, allImages) => {
    if (!uri) return null;
    
    const imageState = imageLoadingState[uri] || { loading: true, error: false };
    
    return (
      <TouchableOpacity 
        style={styles.imageContainer}
        onPress={() => openImageViewer(allImages, index)}>
          {imageState.loading && (
            <View style={styles.imageLoadingContainer}>
              <ActivityIndicator size="small" color="#007BFF" />
            </View>
          )}
          {imageState.error ? (
            <View style={[styles.image, styles.imageError]}>
              <Icon name="broken-image" size={40} color="#999" />
              <Text style={{color: '#999', fontSize: 12, marginTop: 4}}>Error</Text>
            </View>
          ) : (
            <ExpoImage 
              source={{ uri: uri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              onLoad={() => handleImageLoad(uri)}
              onError={() => handleImageError(uri)}
              onLoadStart={() => setImageLoading(uri, true)}
            />
          )}
      </TouchableOpacity>
    );
  };

  const renderCard = ({ item }) => {
    let statusColor = "#007BFF";
    if (item.status === 'accepted') statusColor = "#10B981";
    if (item.status === 'declined') statusColor = "#EF4444";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.userName}>{item.user_name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}> 
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Icon name="place" size={16} color="#888" style={{marginRight: 6}} />
            <Text style={styles.cardValue}>{item.station_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="work" size={16} color="#888" style={{marginRight: 6}} />
            <Text style={styles.cardValue}>{item.role_requested || t('responder_personnel')}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.viewDetailsBtn} onPress={() => openModal(item)}>
          <Text style={styles.viewDetailsText}>{t('viewdetails')}</Text>
          <Icon name="arrow-forward" size={16} color="#007BFF" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.heading}>{t('changerequest')}</Text>
      </View>

      {renderStatusButtons()}

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#007BFF" />
        </View>
      ) : (
        <FlatList
            data={filteredRequests}
            keyExtractor={item => item.request_id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
                <View style={styles.emptyContainer}>
                    <Icon name="inbox" size={60} color="#E5E7EB" />
                    <Text style={styles.emptyText}>{t('norequests') || "No requests found"}</Text>
                </View>
            }
            renderItem={renderCard}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedRequest && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('requestdetails')}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                     <Icon name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.modalScroll}>
                  {/* User Info Section */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalUserTitle}>{selectedRequest.user_name}</Text>
                    
                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalInfoBlock}>
                        <Text style={styles.infoLabel}>{t('stationrequested')}</Text>
                        <Text style={styles.infoValue}>{selectedRequest.station_name}</Text>
                      </View>
                      <View style={styles.modalInfoBlock}>
                        <Text style={styles.infoLabel}>{t('rolerequested')}</Text>
                        <Text style={styles.infoValue}>{selectedRequest.role_requested}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.modalInfoRow}>
                      <View style={styles.modalInfoBlock}>
                         <Text style={styles.infoLabel}>{t('requestedat')}</Text>
                         <Text style={styles.infoValue}>{new Date(selectedRequest.created_at).toLocaleDateString()}</Text>
                      </View>
                      <View style={styles.modalInfoBlock}>
                         <Text style={styles.infoLabel}>{t('status')}</Text>
                         <Text style={[styles.infoValue, { textTransform: 'capitalize' }]}>{selectedRequest.status}</Text>
                      </View>
                    </View>
                  </View>

                  {/* ID Images Section */}
                  <Text style={styles.sectionTitle}>{t('identification')}</Text>
                  
                  <View style={styles.imagesGrid}>
                    <View style={styles.imageWrapper}>
                        <Text style={styles.imageLabel}>{t('idcardfront')}</Text>
                        {renderImageWithLoader(selectedRequest.id_card_front, 0, [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id])}
                    </View>
                    <View style={styles.imageWrapper}>
                        <Text style={styles.imageLabel}>{t('idcardback')}</Text>
                        {renderImageWithLoader(selectedRequest.id_card_back, 1, [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id])}
                    </View>
                  </View>

                  <View style={[styles.imageWrapper, { marginTop: 12 }]}>
                      <Text style={styles.imageLabel}>{t('selfiewithid')}</Text>
                      {renderImageWithLoader(selectedRequest.selfie_with_id, 2, [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id])}
                  </View>

                  {/* Actions */}
                  {selectedRequest.status === 'pending' && (
                      <View style={styles.actionContainer}>
                        <TouchableOpacity style={[styles.modalBtn, styles.declineBtn]} onPress={() => confirmAction(selectedRequest, "declined")}>
                            <Icon name="close" size={20} color="#fff" style={{marginRight: 5}} />
                            <Text style={styles.modalBtnText}>{t('declinerequest')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.modalBtn, styles.acceptBtn]} onPress={() => confirmAction(selectedRequest, "accepted")}>
                            <Icon name="check" size={20} color="#fff" style={{marginRight: 5}} />
                            <Text style={styles.modalBtnText}>{t('acceptrequest')}</Text>
                        </TouchableOpacity>
                      </View>
                  )}
                  
                  {selectedRequest.status !== 'pending' && (
                      <TouchableOpacity style={styles.closeTextBtn} onPress={() => setModalVisible(false)}>
                          <Text style={styles.closeBtnText}>{t('close')}</Text>
                      </TouchableOpacity>
                  )}
                </ScrollView>
              </>
            )}
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', paddingTop: 20 },
  headerContainer: { paddingHorizontal: 20, marginBottom: 15 },
  heading: { fontSize: 28, fontWeight: "700", color: "#1A1A1A", marginBottom: 5 },
  
  // Tabs
  tabContainer: { flexDirection: "row", paddingHorizontal: 20, marginBottom: 15 },
  tab: { 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    marginRight: 10, 
    borderWidth: 1, 
    borderColor: 'transparent' 
  },
  tabText: { fontWeight: "600", fontSize: 13 },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0'
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  userName: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
  cardBody: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardValue: { fontSize: 14, color: '#4B5563', fontWeight: '500' },
  viewDetailsBtn: {
    backgroundColor: '#F0F8FF',
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6
  },
  viewDetailsText: { color: '#007BFF', fontWeight: '600', fontSize: 14 },

  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#9CA3AF', fontSize: 16, marginTop: 10, fontWeight: '500' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  closeBtn: { padding: 5 },
  modalScroll: { padding: 20 },
  
  // Modal Details
  modalSection: { marginBottom: 20 },
  modalUserTitle: { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 15 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  modalInfoBlock: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 16, color: '#1F2937', fontWeight: '600' },

  // Images Section
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 12, marginTop: 5 },
  imagesGrid: { flexDirection: 'row', gap: 12 },
  imageWrapper: { flex: 1 },
  imageLabel: { fontSize: 12, color: '#6B7280', marginBottom: 6, fontWeight: '500' },
  imageContainer: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  image: { width: '100%', height: '100%' },
  imageLoadingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F3F4F6'
  },
  imageError: { justifyContent: 'center', alignItems: 'center' },

  // Action Buttons
  actionContainer: { flexDirection: 'row', gap: 12, marginTop: 30, marginBottom: 20 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { backgroundColor: '#10B981', shadowColor: '#10B981', shadowOpacity: 0.2, shadowOffset: {width: 0, height: 4}, shadowRadius: 6, elevation: 4 },
  declineBtn: { backgroundColor: '#EF4444', shadowColor: '#EF4444', shadowOpacity: 0.2, shadowOffset: {width: 0, height: 4}, shadowRadius: 6, elevation: 4 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  
  closeTextBtn: { marginTop: 20, padding: 15 },
  closeBtnText: { color: '#6B7280', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

export default RequestScreen;