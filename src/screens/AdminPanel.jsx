import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import { useNavigation } from "@react-navigation/native";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";
import Icon from "react-native-vector-icons/MaterialIcons";

const PLACEHOLDER_URI = "https://via.placeholder.com/600x600.png?text=No+Image";
const MIN_LOCATION_CHANGE = 20;
const FETCH_INTERVAL = 30000;

const AdminPanel = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("alert");
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);
  const [readableAddressCache, setReadableAddressCache] = useState({});
  const [isOnline, setIsOnline] = useState(true);
  const [reportCounts, setReportCounts] = useState({});
  const [reportersModalVisible, setReportersModalVisible] = useState(false);
  const [currentReporters, setCurrentReporters] = useState([]);
  const [pickerVisibleIncidentId, setPickerVisibleIncidentId] = useState(null);


  const intervalRef = useRef(null);
  const isFetchingRef = useRef(false);
  const navigation = useNavigation();
  //console.log(SERVER_URL);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) =>
      setIsOnline(state.isConnected)
    );
    return () => unsubscribe();
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

  const deg2rad = (deg) => deg * (Math.PI / 180);
  const getDistanceFromLatLonInM = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getReadableAddress = useCallback(async (location) => {
    if (!location) return "Location unavailable";
    const [lat, lon] = location.split(",").map(Number);

    const cached = readableAddressCache[location];
    if (cached) {
      const distance = getDistanceFromLatLonInM(lat, lon, cached.lat, cached.lon);
      if (distance < MIN_LOCATION_CHANGE) return cached.readable;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return "Permission denied";

      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      let readable = "Address not found";
      if (reverseGeocode && reverseGeocode.length > 0) {
        const { street, city, region, country } = reverseGeocode[0];
        readable = `${street || "Unknown Street"}, ${city || "Unknown City"}, ${region || "Unknown Region"}, ${country || "Unknown Country"}`;
      }

      setReadableAddressCache(prev => ({ ...prev, [location]: { readable, lat, lon } }));
      return readable;
    } catch (error) {
      console.log("Error fetching address:", error);
      return "Error fetching address";
    }
  }, [readableAddressCache]);

  const fetchAndCacheIncidents = useCallback(async () => {
    if (isFetchingRef.current) return null;
    isFetchingRef.current = true;

    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return null;

      const response = await axios.get(`${SERVER_URL}/incident_data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!Array.isArray(response.data)) return null;

      const incidentsWithAddress = await Promise.all(
        response.data
          .filter((incident) => !incident.is_trashed)
          .map(async (incident) => {
            let readable = readableAddressCache[incident.location]?.readable;
            if (!readable) {
              readable = await getReadableAddress(incident.location);
            }
            return { ...incident, readableLocation: readable };
          })
      );
      //console.log("fetch data:" , JSON.stringify(response.data, null , 2));
      const textOnly = incidentsWithAddress.map(({ media, ...rest }) => rest);
      await EncryptedStorage.setItem("cached_incidents", JSON.stringify(textOnly));

      return incidentsWithAddress;
    } catch (err) {
      console.log("Background fetch error:", err);
      return null;
    } finally {
      isFetchingRef.current = false;
    }
  }, [getReadableAddress, readableAddressCache]);

  const fetchReportCounts = useCallback(async () => {
    try {
      const token = await EncryptedStorage.getItem("token");
      if (!token) return;

      const dashboardRes = await axios.get(`${SERVER_URL}/responder_dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      //console.log("Incident Reporters Details " , JSON.stringify(dashboardRes.data , null , 2));
      const reportCountsMap = {};
      const reporterNamesMap = {};
      let totalReports = 0;

      if (Array.isArray(dashboardRes.data)) {
        dashboardRes.data.forEach(item => {
          reportCountsMap[item.incident_id] = item.report_count || 0;
          reporterNamesMap[item.incident_id] = item.reporter_names || [];
          totalReports += item.report_count || 0;
        });
      }

      const reportPercentMap = {};
      for (const id in reportCountsMap) {
        reportPercentMap[id] = totalReports > 0
          ? ((reportCountsMap[id] / totalReports) * 100).toFixed(1)
          : 0;
      }

      setReportCounts({ counts: reportCountsMap, reporters: reporterNamesMap, percentages: reportPercentMap });
    } catch (err) {
      console.log("Failed to fetch report counts:", err);
    }
  }, []);

  useEffect(() => {
    const loadCached = async () => {
      const cached = await EncryptedStorage.getItem("cached_incidents");
      if (cached) setIncidents(JSON.parse(cached));
    };
    loadCached();
  }, []);

  useEffect(() => {
    if (!isOnline) return;

    if (!intervalRef.current) {
      const fetchLoop = async () => {
        const updated = await fetchAndCacheIncidents();
        if (updated) setIncidents(updated);
        await fetchReportCounts();
      };

      fetchLoop();
      intervalRef.current = setInterval(fetchLoop, FETCH_INTERVAL);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOnline, fetchAndCacheIncidents, fetchReportCounts]);

  const onRefresh = async () => {
    setRefreshing(true);
    const updated = await fetchAndCacheIncidents();
    if (updated) setIncidents(updated);
    await fetchReportCounts();
    setRefreshing(false);
  };

  const openGoogleMaps = (location) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
    Linking.openURL(url).catch((err) => console.log("Failed to open Google Maps:", err));
  };

  const openImageModal = (mediaArray, index) => {
    setSelectedMedia(mediaArray);
    setCurrentImageIndex(index);
    setModalVisible(true);
  };

  const handleToggleStatus = (status) => {
    const statusMap = {
      cancelled: { color: "red", text: "Alert" },
      deleted: { color: "red", text: "Alert" },
      alert: { color: "red", text: "Alert" },
      ongoing: { color: "orange", text: "Ongoing" },
      done: { color: "green", text: "Done" },
    };
    return statusMap[status] || { color: "gray", text: "Unknown" };
  };

  // Compute counts
  const statusCounts = {
    alert: incidents.filter(i => i.status === 'alert').length,
    ongoing: incidents.filter(i => i.status === 'ongoing').length,
    done: incidents.filter(i => i.status === 'done').length,
    all: incidents.length
  };

  const filteredIncidents = incidents.filter(
    (incident) =>
      (!statusFilter || incident.status === statusFilter) &&
      (incident.incidentType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.incidentDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.contactInfo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.reporter_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        Incident Reports{" "}
        <Icon
          name={isOnline ? "wifi" : "wifi-off"}
          size={20}
          color={isOnline ? "green" : "red"}
        />
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search incidents..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Status Buttons with counts */}
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginVertical: 10 }}>
        {["all", "alert", "ongoing", "done"].map((status) => {
          const { color, text } = status === "all" ? { color: "#555", text: "All" } : handleToggleStatus(status);
          return (
            <TouchableOpacity
              key={status}
              style={{
                backgroundColor: statusFilter === status || (status === "all" && !statusFilter) ? color : "#ddd",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 20,
              }}
              onPress={() => setStatusFilter(status === "all" ? null : status)}
            >
              <Text style={{ color: statusFilter === status || (status === "all" && !statusFilter) ? "#fff" : "#000", fontWeight: "bold" }}>
                {text} ({statusCounts[status]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!isOnline && (
        <Text style={{ textAlign: "center", color: "red" }}>
          Offline mode: showing cached reports (media unavailable)
        </Text>
      )}

      {filteredIncidents.length === 0 ? (
        <Text style={styles.noReportsText}>No reports found</Text>
      ) : (
        <FlatList
          data={filteredIncidents.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          )}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.status === "alert" && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident info</Text>
                    <Text style={styles.ongoingNoticeText}>
                      This is new Incident Reported ..
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 16, marginTop: 10, marginBottom: 10 }}>
                Reported By: {item.reporter_name || "Unknown"}
              </Text>
              <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                <Text style={styles.locationText}>
                  Location: {item.readable_location || item.readableLocation || item.location}
                </Text>
              </TouchableOpacity>
              <Text>Incident Type: {item.incidentType}</Text>
              { item.incidentType !== "Others" && (
                <Text>Sub-Type: {item.subType || "N/A"}</Text>
              )}
              { item.incidentType === "Others" && (
              <Text>Description: {item.incidentDescription}</Text>
              )}
              <Text>Time: {item.incidentTime}</Text>
              <Text style={styles.date}>
                Date Reported:{' '}
                {new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (item.contactInfo)
                    Linking.openURL(`tel:${item.contactInfo}`).catch((err) =>
                      console.log("Failed to open dialer:", err)
                    );
                }}
              >
                <Text style={{ color: "blue", textDecorationLine: "underline" }}>
                  Contact: {item.contactInfo || "No contact"}
                </Text>
              </TouchableOpacity>
              <Text>Status:</Text>
              <View
                style={{
                  backgroundColor:
                  item.status === 'alert' ? 'red' :
                  item.status === 'ongoing' ? 'yellow' :
                  item.status === 'done' ? 'green' : 'gray',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 5,
                  alignSelf: 'flex-start', // so the box fits the text
                  marginTop: 5
                }}
                >
                <Text style={{ color: item.status === 'ongoing' ? 'black' : 'white', fontWeight: 'bold' }}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCurrentReporters(reportCounts.reporters[item.id] || []);
                  setReportersModalVisible(true);
                }}
              >
                <Text style={{ color: "blue", textDecorationLine: "underline" }}>
                  Report Count: {reportCounts.counts ? reportCounts.counts[item.id] : 0}
                </Text>
              </TouchableOpacity>
              <Text>
                Total Reports (%): {reportCounts.percentages ? `${reportCounts.percentages[item.id]}%` : "0%"}
              </Text>

              {item.stations && item.status !== "cancelled" && item.stations.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontWeight: "bold" }}>Assigned Stations:</Text>
                            
                  {/* Custom Picker */}
                  <TouchableOpacity
                    style={styles.pickerBox}
                    onPress={() => setPickerVisibleIncidentId(item.id)}
                  >
                    <Text style={{ color: "#000" }}>
                      {(item.selectedStation &&
                        item.stations.find(st => st.station_id_str === item.selectedStation)?.station_name) ||
                        item.stations.find(st => st.status === "assigned")?.station_name ||
                        "Stations are still pending......"}
                    </Text>
                    <Icon name="arrow-drop-down" size={24} color="#555" />
                  </TouchableOpacity>
                      
                  <Modal
                    visible={pickerVisibleIncidentId === item.id}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setPickerVisibleIncidentId(null)}
                  >
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.3)",
                        justifyContent: "center",
                        alignItems: "center"
                      }}
                      activeOpacity={1}
                      onPressOut={() => setPickerVisibleIncidentId(null)}
                    >
                      <View
                        style={{
                          width: "80%",
                          backgroundColor: "#fff",
                          borderRadius: 10,
                          paddingVertical: 10
                        }}
                      >
                        {item.stations.filter(st => st.status === "assigned").length > 0 ? (
                          item.stations
                            .filter(st => st.status === "assigned")
                            .map((st) => (
                              <TouchableOpacity
                                key={st.station_id_str}
                                style={{
                                  paddingVertical: 12,
                                  paddingHorizontal: 16,
                                  borderBottomWidth: 1,
                                  borderBottomColor: "#eee"
                                }}
                                onPress={() => {
                                  const updatedIncidents = incidents.map((inc) =>
                                    inc.id === item.id ? { ...inc, selectedStation: st.station_id_str } : inc
                                  );
                                  setIncidents(updatedIncidents);
                                  setPickerVisibleIncidentId(null);
                                }}
                              >
                                <Text>{st.station_name}</Text>
                              </TouchableOpacity>
                            ))
                        ) : (
                          <Text style={{ textAlign: "center", paddingVertical: 12 }}>
                            Stations are still validating your report...
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                      
                  {/* Selected Station Details */}
                  {(item.selectedStation ||
                    item.stations.find(st => st.status === "assigned")) && (() => {
                    const selectedId =
                      item.selectedStation ||
                      item.stations.find(st => st.status === "assigned")?.station_id_str;
                    const selected = item.stations.find(st => st.station_id_str === selectedId);
                    if (!selected) return null;
                    
                    return (
                      <View style={{ marginLeft: 10, marginTop: 6 }}>
                        <Text>Station ID: {selected.station_id_str}</Text>
                        <Text>Station Name: {selected.station_name}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            if (selected.contact)
                              Linking.openURL(`tel:${selected.contact}`).catch(err =>
                                console.log("Failed to open dialer:", err)
                              );
                          }}
                        >
                          <Text style={{ color: "blue", textDecorationLine: "underline" }}>
                            Contact: {selected.contact || "No contact"}
                          </Text>
                        </TouchableOpacity>
                        
                        <Text>
                          Responders:{" "}
                          {item.responder_details
                            ?.filter(resp => resp.station_id === selected.station_id)
                            .map(resp => `${resp.responder_name} (${resp.status})`)
                            .join(", ") || "No responders"}
                        </Text>
                      </View>
                    );
                  })()}
                </View>
              )}
              
              {item.status !== "cancelled" && item.status !== "done" && (
              <TouchableOpacity
                style={styles.trackButton}
                onPress={() =>
                  navigation.navigate("TrackLocation", {
                    incidentId: item.id,
                    incidentLocation: item.location,
                    stationId: item.station_ids,
                  })
                }
              >
                <Text style={styles.trackButtonText}>Track Responders Location</Text>
              </TouchableOpacity>
              )}
              {item.status === "cancelled" && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                    <Text style={styles.ongoingNoticeText}>
                      These Incident cancelled for a Reason
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {item.status === "done" && (
                <TouchableOpacity>
                  <View style={styles.doneNoticeBox}>
                    <Text style={styles.doneNoticeTitle}>Incident Done</Text>
                    <Text style={styles.ongoingNoticeText}>
                      These Incident is Already Done
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <View style={styles.mediaContainer}>
                {isOnline && item.media && item.media.length > 0 ? (
                  item.media.map((mediaItem, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => openImageModal(item.media, index)}
                    >
                      <Image source={{ uri: mediaItem }} style={styles.image} />
                    </TouchableOpacity>
                  ))
                ) : (
                  <TouchableOpacity onPress={() => openImageModal([PLACEHOLDER_URI], 0)}>
                    <Image source={{ uri: PLACEHOLDER_URI }} style={styles.image} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <ImageViewing
        images={selectedMedia.map((uri) => ({ uri }))}
        imageIndex={currentImageIndex}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
        onImageIndexChange={(index) => setCurrentImageIndex(index)}
      />

      {reportersModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "bold", marginBottom: 10 }}>Reporters</Text>
            {currentReporters.map((name, index) => (
              <Text key={index}>{name.trim()}</Text>
            ))}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setReportersModalVisible(false)}
            >
              <Text style={{ color: "#fff", textAlign: "center" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20, marginTop: 18, textAlign: "center" },
  noReportsText: { textAlign: "center", marginTop: 30, fontSize: 20 },
  searchInput: { borderLeftWidth: 3, borderRightWidth: 3, height: 40, borderColor: "gray", borderWidth: 1, marginBottom: 10, marginLeft: 10, marginRight: 10, paddingHorizontal: 20, borderRadius: 5 },
  card: { backgroundColor: "#f9f9f9", padding: 15, borderRadius: 10, marginBottom: 10 },
  mediaContainer: { flexDirection: "row", flexWrap: "wrap", marginVertical: 10 },
  image: { width: 100, height: 100, resizeMode: "cover", margin: 5 },
  locationText: { color: "blue", textDecorationLine: "underline" },
  trackButton: { backgroundColor: "#007BFF", padding: 10, borderRadius: 5, marginTop: 10 },
  trackButtonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    width: "80%"
  },
  closeButton: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 5,
    marginTop: 10
  },
  pickerBox: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f2f2f2",
    marginTop: 5
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

export default AdminPanel;
