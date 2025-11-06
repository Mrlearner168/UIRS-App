import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useContext, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";
import Icon from 'react-native-vector-icons/MaterialIcons';
import { AuthContext } from "../context/AuthContext";

const PLACEHOLDER_URI = "https://via.placeholder.com/600x600.png?text=No+Image";

const UserListReports = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);
  const [readableAddressCache, setReadableAddressCache] = useState({});
  const [isOnline, setIsOnline] = useState(true);
  const navigation = useNavigation();
  const { authData } = useContext(AuthContext);

  // Listen to network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  // Reverse geocode helper
  const getReadableAddress = async (location) => {
    if (!location) return "Location unavailable";
    if (readableAddressCache[location]) return readableAddressCache[location];

    try {
      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Location permission not granted");
        return "Permission denied";
      }

      const [lat, lon] = location.split(",");
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: parseFloat(lat.trim()),
        longitude: parseFloat(lon.trim()),
      });

      let readable = "Address not found";
      if (reverseGeocode && reverseGeocode.length > 0) {
        const { street, city, region, country } = reverseGeocode[0];
        readable = `${street || "Unknown Street"}, ${city || "Unknown City"}, ${region || "Unknown Region"}, ${country || "Unknown Country"}`;
      }

      setReadableAddressCache(prev => ({ ...prev, [location]: readable }));
      return readable;
    } catch (error) {
      return "Error fetching address";
    }
  };
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

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!isOnline) {
        const cached = await EncryptedStorage.getItem("cached_incidents");
        if (cached) setIncidents(JSON.parse(cached));
        console.log("cache: ",JSON.stringify(cached , null , 2));
        setRefreshing(false);
        return;
      }

      const token = await EncryptedStorage.getItem("token");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const response = await axios.get(`${SERVER_URL}/user_reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      //console.log("response: ", response.data);
      if (Array.isArray(response.data)) {
        const incidentsWithAddress = await Promise.all(
          response.data.map(async (incident) => {
            const readable = await getReadableAddress(incident.location);

            // Only keep metadata + online media
            return {
              ...incident,
              readableLocation: readable,
              media: incident.media?.slice(0, 20) || []
            };
          })
        );

        setIncidents(incidentsWithAddress);

        // Save text-only data in EncryptedStorage
        const textOnly = incidentsWithAddress.map(({ media, ...rest }) => rest);
        await EncryptedStorage.setItem("cached_incidents", JSON.stringify(textOnly));
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch incidents.");
    } finally {
      setRefreshing(false);
    }
  }, [navigation, isOnline]);

  // Auto refresh when screen focused
  useFocusEffect(
    useCallback(() => {
      fetchIncidents();
    }, [fetchIncidents])
  );

  // Auto refresh when network reconnects
  useEffect(() => {
    if (isOnline) fetchIncidents();
  }, [isOnline, fetchIncidents]);

  const openGoogleMaps = (location) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
    Linking.openURL(url).catch(err => console.log("Failed to open Google Maps:", err));
  };
  const removeReport = async (reportId) => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to remove this report?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await EncryptedStorage.getItem("token");
              const response = await axios.delete(`${SERVER_URL}/delete_report/${reportId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            
              if (response.status === 200) {
                setIncidents(prev => prev.filter(r => r.id !== reportId));
              
                // Fetch again to sync with backend
                await fetchIncidents();
              
                Alert.alert("Success", "Report removed successfully.");
              } else {
                Alert.alert("Error", response.data.message || "Failed to delete report.");
              }
            } catch (error) {
              console.error("Delete error:", error.response?.data || error.message);
              console.log("Incident id " , reportId)
              Alert.alert("Error", "Failed to delete report.");
            }
          },
        },
      ]
    );
  };
  
  

  const openImageModal = (mediaArray, index) => {
    setSelectedMedia(mediaArray);
    setCurrentImageIndex(index);
    setModalVisible(true);
  };

  const filteredIncidents = incidents.filter((incident) =>
    incident.incidentType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    incident.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    incident.incidentDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    incident.contactInfo?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  //console.log("filteredIncidents:" ,JSON.stringify( filteredIncidents, null , 2 ));
  

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        Your Incident Reports{" "}
        <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? 'green' : 'red'} />
        {isOnline ? " Online" : " Offline"}
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search incidents..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      

      {!isOnline && <Text style={{ textAlign: "center", color: "red" }}>Offline mode: showing cached reports (media unavailable)</Text>}

      {filteredIncidents.length === 0 ? (
        <Text style={styles.noReportsText}>No reports found</Text>
      ) : (
        <FlatList
          data={filteredIncidents.sort((b, a) => new Date(a.created_at) - new Date(b.created_at))}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text>Incident Type: {item.incidentType}</Text>
              <Text>Sub-Type: {item.subType}</Text>
              <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                <Text style={styles.locationText}>
                  Location: {item.processed_location || item.readableLocation}
                </Text>
              </TouchableOpacity>
              {item.incidentType === "Others" &&(
                <Text>Description: {item.incidentDescription}</Text>
              )}
              <Text>Time Reported: {item.incidentTime}</Text>
              <Text style={styles.date}>
                Reported Date:{' '}
                {new Date(item.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                  year: 'numeric',
                })}
              </Text>
              {(item.status !== "done" && item.status !== "cancelled") && (
                <TouchableOpacity
                  style={styles.trackButton}
                  onPress={() => navigation.navigate('TrackLocation', { 
                    incidentId: item.id,
                    incidentLocation: item.location,
                    stationId: item.station_ids
                  })}
                >
                  <Text style={styles.trackButtonText}>View Details</Text>
                </TouchableOpacity>
              )}
              
              <View style={styles.mediaContainer}>
                {isOnline && item.media && item.media.length > 0 ? (
                  item.media.map((mediaItem, index) => (
                    <TouchableOpacity
                    key={index}
                    onPress={() => openImageModal(item.media, index)}
                    >
                      <Image
                        source={{ uri: mediaItem }}
                        style={styles.image}
                        />
                    </TouchableOpacity>
                  ))
                ) : (
                  <TouchableOpacity onPress={() => openImageModal([PLACEHOLDER_URI], 0)}>
                    <Image
                      source={{ uri: PLACEHOLDER_URI }}
                      style={styles.image}
                      />
                  </TouchableOpacity>
                )}
              </View>
              {item.status === "alert" && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident info</Text>
                    <Text style={styles.ongoingNoticeText}>
                      If you want to Remove this report ... Please Click
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
              {item.status === "cancelled" && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                    <Text style={styles.ongoingNoticeText}>
                      You cancelled your report..
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {item.status === "ongoing" && (
                <View style={styles.ongoingNoticeBox}>
                  <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                  <Text style={styles.ongoingNoticeText}>
                    The Responders are Ongoing. Please Wait a while ......
                  </Text>
                </View>
              )}
              {item.status === "alert" && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: 'red', marginLeft: 10 }]}
                  onPress={() => removeReport(item.id)}
                >
                  <Text style={styles.buttonText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchIncidents} />
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20, marginTop: 20, textAlign: "center" },
  noReportsText: { textAlign: "center", marginTop: 30, fontSize: 20 },
  button: { padding: 10, borderRadius: 12, marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  searchInput: {
    borderLeftWidth: 3,
    borderRightWidth: 3,
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 10,
    marginLeft: 10,
    marginRight: 10,
    paddingHorizontal: 20,
    borderRadius: 5
  },
  card: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  mediaContainer: { flexDirection: "row", flexWrap: "wrap", marginVertical: 10 },
  image: { width: 100, height: 100, resizeMode: "cover", margin: 5 },
  locationText: { color: "blue", textDecorationLine: "underline" },
  trackButton: { backgroundColor: "#007BFF", padding: 10, borderRadius: 5, marginTop: 10 },
  trackButtonText: { color: "#fff", textAlign: "center", fontWeight: "bold" },
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

export default UserListReports;
