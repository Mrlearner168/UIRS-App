import { SERVER_URL } from '@env';
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from "@react-navigation/native";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from 'react-native-encrypted-storage';
import ImageViewing from "react-native-image-viewing";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import RespondersModal from '../components/ResponderListModal';
import { useGlobalIncidentListener } from '../hook/useGlobalIncidentListener';

const ResponderViewList = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [resModalVisible, setResModalVisible] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [stationId, setStationId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [filterStatus, setFilterStatus] = useState("alert");
  const [userRole, setUserRole] = useState(""); // role of current user
  const [respondersList, setRespondersList] = useState([]); 
  const [incidentId, setIncidentId] = useState(null); // to store current incident ID
  const [is_head, setIsHead] = useState(false);
  const [user_idF , setUser_id] = useState(null)
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const getStation = async () => {
      try {
        const token = await EncryptedStorage.getItem("token");
        const res = await axios.get(`${SERVER_URL}/users_profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStationId(res.data.station_id);
        setUserRole(res.data.role);
        setIsHead(res.data.is_head || false);
        setUser_id(res.data.id);
      } catch (err) {
        console.log("Failed to fetch station:", err);
      }
    };
    getStation();
  }, []);

  useGlobalIncidentListener(stationId, (incident) => {
    setIncidents(prev => [incident, ...prev]);
  });
  //console.log(userRole);
  const getReadableAddress = async (location) => {
    if (!location) return "Location unavailable";
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return "Location permission denied";

      const [lat, lon] = location.split(",");
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: parseFloat(lat.trim()),
        longitude: parseFloat(lon.trim()),
      });
      if (reverseGeocode.length > 0) {
        const { street, city, region, country } = reverseGeocode[0];
        return `${street || "Unknown Street"}, ${city || "Unknown City"}, ${region || "Unknown Region"}, ${country || "Unknown Country"}`;
      }
      return "Address not found";
    } catch {
      return "Error fetching address";
    }
  };

  const fetchIncidentsWithAddresses = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!isOnline) {
        const cached = await EncryptedStorage.getItem("cached_responder_incidents");
        if (cached) setIncidents(JSON.parse(cached));
        setRefreshing(false);
        return;
      }
    
      const token = await EncryptedStorage.getItem("token");
    
      // Fetch main incident data
      const response = await axios.get(`${SERVER_URL}/incident_data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      //console.log("Server /incident_data response:", JSON.stringify(response.data, null, 2));
      // Fetch report counts from responder_dashboard
      const dashboardRes = await axios.get(`${SERVER_URL}/responder_dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      //console.log("Server /responder_dashboard response:", JSON.stringify(dashboardRes.data, null , 2));
    
      // Map report counts by incident_id
      const reportCountsMap = {};
      if (Array.isArray(dashboardRes.data)) {
        dashboardRes.data.forEach(item => {
          reportCountsMap[item.incident_id] = item.report_count || 0;
        });
      }
    
      if (Array.isArray(response.data)) {
        const incidentsWithAddresses = await Promise.all(
          response.data.map(async (incident) => {
            const readableAddress = await getReadableAddress(incident.location);
            const report_count = reportCountsMap[incident.id] || 0;
            return { ...incident, readableAddress, report_count };
          })
        );
      
        //console.log("Processed incidents with addresses:",JSON.stringify(incidentsWithAddresses, null, 2));
      
        setIncidents(incidentsWithAddresses);
        const textOnly = incidentsWithAddresses.map(({ media, ...rest }) => rest);
        await EncryptedStorage.setItem("cached_responder_incidents", JSON.stringify(textOnly));
      }
    } catch (error) {
      console.log("Error fetching incidents:", error);
      Alert.alert("Error", "Failed to fetch incidents.");
    } finally {
      setRefreshing(false);
    }
  }, [isOnline]);
  
  // Hook for auto-fetch when screen focused
  useFocusEffect(
    useCallback(() => {
      fetchIncidentsWithAddresses();
    }, [fetchIncidentsWithAddresses])
  );

  // Pull down refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchIncidentsWithAddresses();
  }, [fetchIncidentsWithAddresses]);

  const handleLocationClick = (location) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    Linking.openURL(url).catch(() => Alert.alert("Error", "Unable to open Google Maps."));
  };

  const handleDialPhone = (phoneNumber) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => Alert.alert("Error", "Unable to open dialer."));
  };

  const toggleIncidentStatus = async (incidentId, currentStatus) => {
    try {
      const token = await EncryptedStorage.getItem("token");
      let newStatus = currentStatus === "alert" ? "ongoing" : currentStatus === "ongoing" ? "done" : null;
      if (!newStatus) return;

      await axios.put(
        `${SERVER_URL}/update_incident_status/${incidentId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      //console.log(`Incident ${incidentId} status updated to ${newStatus}`);
      setIncidents(prev =>
        prev.map(i => (i.id === incidentId ? { ...i, status: newStatus } : i))
      );
    } catch {
      Alert.alert("Error", "Unable to update status.");
    }
  };

  const openImageModal = (mediaArray, index) => {
    setSelectedMedia(mediaArray);
    setCurrentImageIndex(index);
    setModalVisible(true);
  };

  const handleToggleStatus = (status) => {
    const statusMap = {
      deleted: { color: "green", text: "Deleted" },
      assigned: { color: "brown", text: "Assigned" },
      alert: { color: "red", text: "Alert" },
      ongoing: { color: "orange", text: "Ongoing" },
      done: { color: "green", text: "Done" },
      deleted: { color: "green", text: "Deleted" },
      cancelled: { color: "red", text: "Alert" },
    };
    return statusMap[status] || { color: "gray", text: "Unknown" };
  };

  const filteredIncidents = incidents
    .filter(incident =>
      [incident.incidentType, incident.location, incident.incidentDescription, incident.contactInfo]
        .join(" ")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
    .filter(incident => {
      if (!filterStatus) return true;

      // Only show in "done" tab if responder_status is done
      if (filterStatus === "done") return incident.responder_status === "done";

      // Hide done responders from "ongoing" and "alert"
      if (filterStatus === "ongoing") return incident.status === "ongoing" && incident.responder_status !== "done";
      if (filterStatus === "alert") return incident.status === "alert" && incident.responder_status !== "done";

      return incident.status === filterStatus;
    });


  const countByStatus = incidents.reduce(
    (acc, incident) => {
      // Count as "done" if responder_status is done
      if (incident.responder_status === "done") {
        acc.done = (acc.done || 0) + 1;
      }
      // Count as "ongoing" only if not done
      else if (incident.status === "ongoing" && incident.responder_status !== "done") {
        acc.ongoing = (acc.ongoing || 0) + 1;
      }
      // Count as "alert" only if not done
      else if (incident.status === "alert" && incident.responder_status !== "done") {
        acc.alert = (acc.alert || 0) + 1;
      }
      return acc;
    },
    { alert: 0, ongoing: 0, done: 0 }
  );

  
  const handleViewResponders = async (incidentId) => {
    try {
      const token = await EncryptedStorage.getItem('token');
      const response = await fetch(`${SERVER_URL}/incident/${incidentId}/stations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setRespondersList(data);
        setIncidentId(incidentId); 
        setResModalVisible(true);

      }
    } catch (error) {
      console.log(error);
    }
  };

  //console.log("Responders data:", JSON.stringify(respondersList, null, 2));

  
  //console.log("respondersList:", JSON.stringify(respondersList, null, 2));
  const totalReports = incidents.reduce((sum, i) => sum + (i.report_count || 0), 0);
  //console.log("availableResponders:", availableResponders);
  //console.log("filtered incidents:", JSON.stringify(filteredIncidents, null , 2));

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {t('head')}{" "}
        <Icon name={isOnline ? "wifi" : "wifi-off"} size={20} color={isOnline ? "green" : "red"} />
      </Text>
      <TextInput
        style={styles.searchInput}
        placeholder={t('search')}
        placeholderTextColor="#888"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <View style={styles.filterContainer}>
        {['alert', 'ongoing', 'done'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterButton, filterStatus === status && styles.filterButtonActive]}
            onPress={async () => {
              setFilterStatus(status);       // update local filter
              await fetchIncidentsWithAddresses();  // refresh from server
            }}
          >
            <Text style={[styles.filterText, filterStatus === status && { color: '#fff' }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)} ({countByStatus[status] || 0})
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterButton, filterStatus === '' && styles.filterButtonActive]}
          onPress={async () => {
            setFilterStatus('');
            await fetchIncidentsWithAddresses();  // refresh all incidents
          }}
        >
          <Text style={[styles.filterText, filterStatus === '' && { color: '#fff' }]}>
            All ({incidents.length})
          </Text>
        </TouchableOpacity>
      </View>

      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <FlatList
          data={filteredIncidents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))}
        keyExtractor={(item, index) => index.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#007bff"]}
            tintColor="#007bff"
          />
        } 
        renderItem={({ item }) => {
          const percentReports = totalReports > 0 ? ((item.report_count || 0) / totalReports * 100).toFixed(0) : 0;
          const currentStation = item.stations?.find(
            (s) => s.station_id === stationId
          );

          const currentStationStatus = item.incidents_station_status[stationId]; // stationId from profile

          const stationStatus = currentStation?.status || "unassigned";
          //const stationResponders = item.stations?.find(s => s.station_id === stationId)?.assigned_responders || [];
          //const allDeleted = stationResponders.length > 0 && stationResponders.every(r => r.is_deleted === true);
          //console.log("stationResponders for incident", item.id, ":", JSON.stringify(stationResponders, null, 2));

          return (
            <TouchableOpacity>
              <View style={styles.card}>
                <Text style={{ fontSize: 16, marginTop: 10, marginBottom: 10 }}>
                 {t('reportedby')} {item.reporter_name || "Unknown"}
                </Text>
                <Text>
                  {t('location')}{item.readable_location || item.readableAddress || "Fetching..."}
                </Text>
                <Text>{t('incidenttype')}{item.incidentType}</Text>
                {item.incidentType !== "Others" && (
                  <Text>{t('subtype')} {item.subType || "N/A"}</Text>
                )}
                {item.incidentType === "Others" && (
                <Text>{t('description')}{item.incidentDescription}</Text>
                )}
                <Text>{t('time')} {item.incidentTime}</Text>
                <Text style={styles.date}>
                  {t('datereported')}{' '}
                  {new Date(item.created_at).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                    year: 'numeric',
                  })}
                </Text>
                  
                  <Text>{t('reportcount')} {item.report_count || 0} ({percentReports}%)</Text>
                <Text style={styles.clickableText} onPress={() => handleDialPhone(item.contactInfo)}>
                  {t('contact')} {item.contactInfo}
                </Text>
                <View style={styles.mediaContainer}>
                  {item.media?.length ? (
                    item.media.map((media, i) => (
                      <TouchableOpacity key={i} onPress={() => openImageModal(item.media, i)}>
                        <Image source={{ uri: media }} style={styles.image} />
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text>No media available</Text>
                  )}
                </View>
                {(item.status === "ongoing" || item.status === "alert") &&
                  item.responder_status !== "done" && !is_head && userRole === "responder_personnel" && (
                  <View style={styles.ongoingNoticeBox}>
                    <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('ongoing')}
                    </Text>
                  </View>
                )}
                {item.status !== "done" && item.responder_status !== "done" &&
                  stationStatus === "assigned" &&
                  (userRole === "responder_head" ||
                    (userRole === "responder_personnel" && is_head)) 
                    && (item.user_id === user_idF)
                    && (
                  <View style={styles.ongoingNoticeBox}>
                    <Text style={styles.ongoingNoticeTitle}>Incident Info</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('ongoininfo')}
                    </Text>
                  </View>
                )}

                {item.status === "ongoing" && item.responder_status === "done" && (userRole==="responder_head" || userRole === "responder_personnel") &&(
                  <View style={styles.ongoingNoticeBox}>
                    <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('partialdone')}
                    </Text>
                  </View>
                )}
                {item.responder_status === "declined" && (userRole==="responder_head" || is_head) && (item.user_id !== user_idF) &&(
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Declined</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('accept')}
                    </Text>
                  </View>
                )}
                {currentStationStatus === "declined" && userRole === "responder_personnel" && !is_head && (item.status !== "done")&& (
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Declined</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('stationdecline')}
                    </Text>
                  </View>
                )}


                {item.status === "alert" && item.responder_status !== "declined" && 
                  (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) &&
                  (item.user_id !== user_idF)
                  &&(
                  <TouchableOpacity>
                    <View style={styles.doneNoticeBox}>
                      <Text style={styles.doneNoticeTitle}>Incident Alert</Text>
                      <Text style={styles.ongoingNoticeText}>
                        {t('resalert')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {item.status === "ongoing" && 
                  item.responder_status !== "declined" && 
                  item.responder_status !== "done" && 
                  (userRole === "responder_head" || (userRole === "responder_personnel" && is_head))
                  && (item.user_id !== user_idF) && (
                  <View style={styles.ongoingNoticeBox}>
                    <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('resdone')}
                    </Text>
                  </View>
                )}
                
                {item.status === "done" && (
                  <TouchableOpacity>
                    <View style={styles.doneNoticeBox}>
                      <Text style={styles.doneNoticeTitle}>Incident Done</Text>
                      <Text style={styles.ongoingNoticeText}>
                        {t('done')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {item.status === "cancelled" &&  (
                  <TouchableOpacity>
                    <View style={styles.cancelNoticeBox}>
                      <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                      <Text style={styles.ongoingNoticeText}>
                        {t('cancelled')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                
                {/* Buttons */}
                <View style={styles.buttonContainer}>
                  {item.status !== "cancelled" && (
                    <>
                      {/* Row of 3 buttons */}
                      <View style={styles.rowButtons}>
                        {/* Track Location */}
                        {item.status !== "done" && item.responder_status !== "done" && stationStatus === "assigned" && (
                          <TouchableOpacity
                            style={[styles.trackButton, styles.equalButtonSize]}
                            onPress={() => handleLocationClick(item.location)}
                          >
                            <Text style={styles.buttonText}>Track</Text>
                          </TouchableOpacity>
                        )}

                        {/* Status Toggle */}
                        {item.status !== "done" && item.responder_status !== "done" &&
                          stationStatus === "assigned" &&
                          (userRole === "responder_head" ||
                            (userRole === "responder_personnel" && is_head)) 
                            && (item.user_id !== user_idF)
                            && (
                            <TouchableOpacity
                              style={[
                                styles.statusToggle,
                                styles.equalButtonSize,
                                { backgroundColor: handleToggleStatus(item.responder_status).color },
                              ]}
                              onPress={() => toggleIncidentStatus(item.id, item.responder_status)}
                            >
                              <Text style={styles.statusText}>
                                {handleToggleStatus(item.responder_status).text}
                              </Text>
                            </TouchableOpacity>
                          )}
                      </View>
                        
                      {/* Second row - View Responders */}
                      {item.status !== "done" && item.responder_status !== "done" && (
                        <TouchableOpacity
                          style={[styles.viewRespondersButton, styles.equalButtonSize]}
                          onPress={() => handleViewResponders(item.id)}
                        >
                          <Text style={styles.buttonText}>{t('reslist')}</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </View>

              </View>
            </TouchableOpacity>
          );
          }}
        />
        <ImageViewing
          images={selectedMedia.map(uri => ({ uri }))}
          imageIndex={currentImageIndex}
          visible={isModalVisible}
          onRequestClose={() => setModalVisible(false)}
        />
        <RespondersModal
          visible={resModalVisible}
          onClose={() => setResModalVisible(false)}
          responders={respondersList}
          incidentId={incidentId}
          refreshData={onRefresh}
        />
      </SafeAreaView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14 ,backgroundColor: "#fff",},
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
  searchInput: { height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, paddingHorizontal: 10, backgroundColor: "#f0f0f0", borderRadius: 5, color: "#000" },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  filterButton: { padding: 8, borderWidth: 1, borderRadius: 5, borderColor: '#ccc' },
  filterButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  filterText: { color: '#000' },
  card: { backgroundColor: "#f9f9f9", padding: 14, borderRadius: 16, marginBottom: 18 },
  clickableText: { color: "blue", textDecorationLine: "underline" },
  mediaContainer: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 10 },
  image: { width: 100, height: 100, margin: 5, borderRadius: 10 },
  trackButton: { backgroundColor: "#007bff", padding: 10, borderRadius: 10 },
  buttonText: { color: "#fff", fontWeight: "bold" },
  statusToggle: { padding: 10, borderRadius: 5 },
  statusText: { color: "#fff", fontWeight: "bold" },
  equalButtonSize: { flex: 1, justifyContent: "center", alignItems: "center", marginHorizontal: 2 },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 10,
  },
  responderItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 8,
  },
  responderName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  responderPhone: {
    fontSize: 14,
    color: '#555',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  cancelButton: {
    backgroundColor: '#ccc',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    marginRight: 5,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: '#007bff',
    padding: 10,
    borderRadius: 8,
    flex: 1,
    marginLeft: 5,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  viewRespondersButton: {
    backgroundColor: "#4B9CD3",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonContainer: {
  marginTop: 10,
  alignItems: "center",
},

rowButtons: {
  flexDirection: "row",
  justifyContent: "space-between",
  width: "100%",
  marginBottom: 8,
},

equalButtonSize: {
  flex: 1,
  marginHorizontal: 4,
  paddingVertical: 10,
  borderRadius: 8,
  alignItems: "center",
},

viewRespondersButton: {
  backgroundColor: "#4B9CD3",
  paddingVertical: 10,
  borderRadius: 8,
  alignItems: "center",
  width: "100%",
},
ongoingNoticeBox: {
  backgroundColor: '#FFF4E5',
  borderLeftWidth: 5,
  borderLeftColor: '#FFA500',
  padding: 10,
  borderRadius: 8,
  marginTop: 8,
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
cancelNoticeBox: {
  backgroundColor: '#FFF4E5',
  borderLeftWidth: 5,
  borderLeftColor: '#e10d0dff',
  padding: 10,
  borderRadius: 8,
  marginTop: 8,
},
cancelNoticeTitle: {
  fontSize: 16,
  fontWeight: 'bold',
  color: 'hsla(0, 88%, 44%, 1.00)',
  marginBottom: 4,
},
ongoingNoticeText: {
  fontSize: 14,
  color: '#555',
  lineHeight: 20,
},

});

export default ResponderViewList;
