import { SERVER_URL } from '@env';
import axios from "axios";
import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import EncryptedStorage from 'react-native-encrypted-storage';
import ImageViewing from "react-native-image-viewing";
const RequestScreen = () => {
  const [requests, setRequests] = useState([]);
  const [token, setToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");

  // new states for image viewer
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const {t} = useTranslation();

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
    try {
      const res = await axios.get(`${SERVER_URL}/role_requests_status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(res.data);
      console.log("Fetched requests DATA:", res.data);
    } catch (err) {
      console.log(err);
    }
  };

  const openModal = (request) => {
    setSelectedRequest(request);
    setModalVisible(true);
  };

  const handleAction = async (request, action) => {
    try {
      await axios.put(`${SERVER_URL}/validate_role_request/${request.request_id}`, {
        action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert("Success", `Request ${action}ed successfully.`);
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
    const colors = { pending: "#007BFF", accepted: "#28A745", declined: "#FF0000" };

    return (
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 10 }}>
        {statuses.map((status) => (
          <TouchableOpacity
            key={status}
            style={{
              backgroundColor: statusFilter === status ? colors[status] : "#ccc",
              flex: 1,
              marginHorizontal: 5,
              padding: 10,
              borderRadius: 5,
              alignItems: "center"
            }}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", textTransform: "capitalize" }}>
              {status}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const filteredRequests = requests.filter(req => req.status === statusFilter);

  // helper to open viewer
  const openImageViewer = (images, index) => {
    setViewerImages(images.map(uri => ({ uri })));
    setViewerIndex(index);
    setImageViewerVisible(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('changerequest')}</Text>

      {renderStatusButtons()}

      <FlatList
        data={filteredRequests}
        keyExtractor={item => item.request_id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text>{t('firstname' )}: {item.user_name}</Text>
            <Text>{t('stationrequested')} {item.station_name}</Text>
            <Text>{t('status')}{item.status}</Text>

            <TouchableOpacity style={[styles.acceptButton, { marginTop: 10 }]} onPress={() => openModal(item)}>
              <Text style={styles.buttonText}>{t('viewdetails')}</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedRequest && (
              <ScrollView style={{ width: '100%' }}>
                <Text style={styles.modalTitle}>{selectedRequest.user_name}</Text>
                <Text style={{ fontWeight: 'bold', marginTop: 5 }}>{t('rolerequested')} {selectedRequest.role_requested} </Text>
                <Text>{t('stationrequested')} {selectedRequest.station_name}</Text>
                <Text>{t('status')} {selectedRequest.status}</Text>
                <Text>{t('requestedat')} {new Date(selectedRequest.created_at).toLocaleString()}</Text>
                <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{t('idcardfront')}</Text>
                <TouchableOpacity onPress={() => openImageViewer(
                  [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id], 0)}>
                  <Image source={{ uri: selectedRequest.id_card_front }} style={styles.image} />
                </TouchableOpacity>

                <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{t('idcardback')}</Text>
                <TouchableOpacity onPress={() => openImageViewer(
                  [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id], 1)}>
                  <Image source={{ uri: selectedRequest.id_card_back }} style={styles.image} />
                </TouchableOpacity>

                <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{t('selfiewithid')}</Text>
                <TouchableOpacity onPress={() => openImageViewer(
                  [selectedRequest.id_card_front, selectedRequest.id_card_back, selectedRequest.selfie_with_id], 2)}>
                  <Image source={{ uri: selectedRequest.selfie_with_id }} style={styles.image} />
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 }}>
                  <TouchableOpacity style={styles.acceptButton} onPress={() => handleAction(selectedRequest, "accepted")}>
                    <Text style={styles.buttonText}>{t('acceptrequest')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineButton} onPress={() => handleAction(selectedRequest, "declined")}>
                    <Text style={styles.buttonText}>{t('declinerequest')}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={{ marginTop: 10, color: 'blue', textAlign: 'center' }}>{t('close')}</Text>
                </TouchableOpacity>
              </ScrollView>
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
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 10 , textAlign:"center" , marginBottom: 25},
  card: { backgroundColor: "#f9f9f9", padding: 15, borderRadius: 10, marginBottom: 10 },
  acceptButton: { backgroundColor: '#007BFF', padding: 10, borderRadius: 5, alignItems: 'center', flex:1, marginHorizontal:5 },
  declineButton: { backgroundColor: '#FF0000', padding: 10, borderRadius: 5, alignItems: 'center', flex:1, marginHorizontal:5 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  modalContainer: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.5)' },
  modalContent: { width:'90%', maxHeight:'80%', backgroundColor:'#fff', padding:20, borderRadius:10, alignItems:'center' },
  modalTitle: { fontSize:18, fontWeight:'bold', marginBottom:10, textAlign:'center' },
  image: { width:'100%', height:200, marginBottom:15, borderRadius:10, resizeMode:'contain' },
});

export default RequestScreen;
