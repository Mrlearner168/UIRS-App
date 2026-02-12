import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import { Image as ExpoImage } from 'expo-image';
import * as Location from "expo-location";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthContext } from "../context/AuthContext";

const PLACEHOLDER_URI = "https://via.placeholder.com/600x600.png?text=No+Image";

const UserListReports = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);
  const [readableAddressCache, setReadableAddressCache] = useState({});
  const [isOnline, setIsOnline] = useState(true);
  const [imageLoadingState, setImageLoadingState] = useState({});
  const [fullImageViewerVisible, setFullImageViewerVisible] = useState(false);
  const navigation = useNavigation();
  const { authData } = useContext(AuthContext);
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const fetchAbortController = useRef(new AbortController());
  const fetchInProgressRef = useRef(false);



  // Image loading and error handling
  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: false, loaded: true }
    }));
  }, []);

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: true, loaded: false }
    }));
  }, []);

  const setImageLoading = useCallback((uri, loading) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { ...prev[uri], loading }
    }));
  }, []);

  // Reverse geocode helper with caching
  const getReadableAddress = useCallback(async (location) => {
    try {
      if (!location) return "Location unavailable";
      if (readableAddressCache[location]) return readableAddressCache[location];

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("Location permission not granted");
        return "Permission denied";
      }

      const coords = location.split(",");
      if (coords.length !== 2) return "Invalid location";
      
      const [lat, lon] = coords;
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: parseFloat(lat.trim()),
        longitude: parseFloat(lon.trim()),
      });

      let readable = "Address not found";
      if (reverseGeocode && reverseGeocode.length > 0) {
        const { street, city, region, country } = reverseGeocode[0];
        readable = `${street || "Unknown Street"}, ${city || "Unknown City"}, ${region || "Unknown Region"}, ${country || "Unknown Country"}`;
      }

      if (isMountedRef.current) {
        setReadableAddressCache(prev => ({ ...prev, [location]: readable }));
      }
      return readable;
    } catch (error) {
      console.error("Geocoding error:", error);
      return "Address unavailable";
    }
  }, [readableAddressCache]);

  // Listen to network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  // Check login token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (!storedToken && isMountedRef.current) {
          navigation.navigate("Login");
        }
      } catch (error) {
        console.error("Token fetch error:", error);
        if (isMountedRef.current) {
          Alert.alert("Error", "Failed to fetch authentication token. Please try again.");
        }
      }
    };
    if (isMountedRef.current) {
      fetchToken();
    }
  }, [navigation]);

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    if (fetchInProgressRef.current) return; // Prevent duplicate requests
    if (!isMountedRef.current) return;

    fetchInProgressRef.current = true;
    setLoading(true);
    setRefreshing(true);

    // Cancel previous request
    fetchAbortController.current.abort();
    fetchAbortController.current = new AbortController();

    try {
      if (!isOnline) {
        try {
          const cached = await EncryptedStorage.getItem("cached_incidents");
          if (cached && isMountedRef.current) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setIncidents(parsed);
          }
        } catch (cacheError) {
          console.error("Cache read error:", cacheError);
        }
        return;
      }

      const token = await EncryptedStorage.getItem("token");
      if (!token) {
        if (isMountedRef.current) navigation.navigate("Login");
        return;
      }

      if (!SERVER_URL) {
        if (isMountedRef.current) Alert.alert("Error", "Server URL not configured.");
        return;
      }

      const response = await axios.get(`${SERVER_URL}/user_reports`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: fetchAbortController.current.signal,
        timeout: 30000
      });
      console.log("Fetch incidents response:", response.data);
      if (!isMountedRef.current) return;

      if (Array.isArray(response.data)) {
        const incidentsWithAddress = await Promise.all(
          response.data.map(async (incident) => {
            if (!incident) return null;
            try {
              const readable = await getReadableAddress(incident.location || "Unknown");
              return {
                ...incident,
                readableLocation: readable,
                media: Array.isArray(incident.media) ? incident.media.slice(0, 20) : []
              };
            } catch (error) {
              console.error("Error processing incident:", incident.id, error);
              return { ...incident, readableLocation: "Address unavailable", media: [] };
            }
          })
        );

        const validIncidents = incidentsWithAddress.filter(i => i !== null);
        if (isMountedRef.current) setIncidents(validIncidents);

        // Save to cache
        try {
          const textOnly = validIncidents.map(({ media, ...rest }) => rest);
          await EncryptedStorage.setItem("cached_incidents", JSON.stringify(textOnly));
        } catch (cacheError) {
          console.error("Cache save error:", cacheError);
        }
      }
    } catch (error) {
      // Suppress expected cancellations
      if (error.name === 'AbortError' || axios.isCancel(error)) return;
      console.error("Fetch incidents error:", error);
      if (isMountedRef.current) {
        Alert.alert("Error", error.response?.data?.message || "Failed to fetch incidents.");
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
      fetchInProgressRef.current = false;
    }
  }, [navigation, isOnline, getReadableAddress]);

  // Auto refresh when screen focused
  useFocusEffect(
    useCallback(() => {
      if (isMountedRef.current && authData?.token) {
        fetchIncidents();
      }
    }, [fetchIncidents, authData])
  );

  // Auto refresh when network reconnects
  useEffect(() => {
    if (isOnline) fetchIncidents();
  }, [isOnline, fetchIncidents]);

  const openGoogleMaps = (location) => {
    try {
      if (!location || typeof location !== 'string') {
        Alert.alert("Error", "Invalid location");
        return;
      }
      const encodedLocation = encodeURIComponent(location);
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
      Linking.openURL(url).catch(err => {
        console.error("Failed to open Google Maps:", err);
        Alert.alert("Error", "Could not open Google Maps");
      });
    } catch (error) {
      console.error("Error opening maps:", error);
      Alert.alert("Error", "An error occurred");
    }
  };
  const removeReport = async (reportId) => {
    console.log('[RemoveReport] Triggered', { reportId });
    if (!reportId) {
      Alert.alert("Error", "Invalid report ID.");
      return;
    }

    Alert.alert(
      "Confirm Delete",
      t('removeinfo'),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('remove'),
          style: "destructive",
          onPress: async () => {
            console.log('[RemoveReport] User confirmed removal', { reportId });
            try {
              const token = await EncryptedStorage.getItem("token");
              console.log('[RemoveReport] Token present:', !!token, 'token length:', token?.length || 0);
              if (!token) {
                console.warn('[RemoveReport] No token found, aborting');
                Alert.alert("Error", "Authentication token not found.");
                return;
              }
              if (!SERVER_URL) {
                console.warn('[RemoveReport] SERVER_URL missing');
                Alert.alert("Error", "Server URL not configured.");
                return;
              }

              const requestConfig = {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 30000
              };
              console.log('[RemoveReport] Sending DELETE', { url: `${SERVER_URL}/delete_report/${reportId}`, ...requestConfig });

              const response = await axios.delete(`${SERVER_URL}/delete_report/${reportId}`, requestConfig);

              console.log('[RemoveReport] Response', {
                status: response.status,
                data: response.data,
                headers: response.headers,
              });

              if (response.status === 200 || response.status === 204) {
                if (isMountedRef.current) {
                  setIncidents(prev => prev.filter(r => r.id !== reportId));
                  Alert.alert("Success", t('reportremove'));
                  await fetchIncidents();
                }
              } else {
                Alert.alert("Error", response.data?.message || "Failed to delete report.");
              }
            } catch (error) {
              console.error("Delete error:", error.response?.data || error.message, {
                status: error.response?.status,
                headers: error.response?.headers,
                config: {
                  url: error.config?.url,
                  method: error.config?.method,
                  headers: error.config?.headers,
                  timeout: error.config?.timeout,
                },
              });
              if (isMountedRef.current) {
                Alert.alert("Error", error.response?.data?.message || "Failed to delete report.");
              }
            }
          },
        },
      ]
    );
  };
  console.log("Rendering UserListReports with incidents count:", JSON.stringify(incidents, null, 2));
  const filteredIncidents = incidents
    .filter((incident) => {
      if (!incident) return false;
      const searchLower = (searchQuery || "").toLowerCase();
      return (
        (incident.incidentType?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.location?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.incidentDescription?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.contactInfo?.toLowerCase?.() || "").includes(searchLower)
      );
    })
    .sort((b, a) => {
      try {
        return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
      } catch (error) {
        console.error("Sort error:", error);
        return 0;
      }
    });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      fetchAbortController.current.abort();
    };
  }, []);
  
  console.log("rendering data " , JSON.stringify(incidents, null, 2));

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {t('yourreports')}{" "}
        <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? 'green' : 'red'} />
        {isOnline ? " Online" : " Offline"}
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder={t('search')}
        placeholderTextColor={"#888"}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />


      {!isOnline && <Text style={{ textAlign: "center", color: "red" }}>{t('offline')}(media unavailable)</Text>}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={styles.loadingText}>Loading Reports...</Text>
        </View>
      ) : filteredIncidents.length === 0 ? (
        <Text style={styles.noReportsText}>{t('norepfound')}</Text>
      ) : (
        <FlatList
          data={filteredIncidents}
          keyExtractor={(item, index) => item?.id?.toString() || index.toString()}
          renderItem={({ item }) => {
            if (!item) return null;
            return (
              <View style={styles.card}>
                <Text>{t('incidenttype')}{item.incidentType || 'Unknown'}</Text>
                <Text>{t('subtype')}{item.subType || 'Unknown'}</Text>
                {item.location && (
                  <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                    <Text style={styles.locationText}>
                      {t('location')}{item.processed_location || item.readableLocation || 'Location unavailable'}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.incidentType === "Others" && item.incidentDescription && (
                  <Text>{t('description')}{item.incidentDescription}</Text>
                )}
                {item.incidentTime && <Text>{t('reportedtime')} {item.incidentTime}</Text>}
                {item.created_at && (
                  <Text style={styles.date}>
                    {t('datereported')}{' '}
                    {(() => {
                      try {
                        return new Date(item.created_at).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'long',
                          year: 'numeric',
                        });
                      } catch (error) {
                        console.error('Date error:', error);
                        return 'Invalid date';
                      }
                    })()}
                  </Text>
                )}
                {(item.status !== "done" && item.status !== "cancelled" && item.is_deleted === false) && (
                  <TouchableOpacity
                    style={styles.trackButton}
                    onPress={() => navigation.navigate('TrackLocation', {
                      incidentId: item.incident_id,
                      incidentLocation: item.location,
                      stationId: item.station_ids
                    })}
                  >
                    <Text style={styles.trackButtonText}>{t('viewdetails')}</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.mediaContainer}>
                  <Text style={styles.mediaTitle}>
                    📷 Media Evidence ({item.media?.length || 0} files)
                  </Text>
                  {isOnline && item.media && item.media.length > 0 ? (
                    <View style={styles.mediaGrid}>
                      {(typeof item.media === 'string' ? item.media.split(',').map(u => u.trim()) : item.media).map((uri, i) => {
                        const imageState = imageLoadingState[uri] || { loading: true, error: false, loaded: false };
                        const isError = imageState.error;
                        const isLoading = imageState.loading && !imageState.loaded;

                        return (
                          <TouchableOpacity
                            key={i}
                            style={[styles.imageWrapper, isError && styles.imageErrorWrapper]}
                            onPress={() => {
                              if (!isError) {
                                const mediaArray = typeof item.media === 'string' ? item.media.split(',').map(u => u.trim()) : item.media;
                                setSelectedMedia(mediaArray.filter(m => !imageLoadingState[m]?.error));
                                setCurrentImageIndex(mediaArray.filter(m => !imageLoadingState[m]?.error).indexOf(uri));
                                setFullImageViewerVisible(true);
                              }
                            }}
                            disabled={isError}
                          >
                            {isLoading && (
                              <View style={styles.imageLoadingContainer}>
                                <ActivityIndicator size="large" color="#007BFF" />
                              </View>
                            )}
                            {!isError ? (
                              <ExpoImage
                                source={{ uri: uri }}
                                style={[styles.image, isLoading && { opacity: 0.5 }]}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                onLoad={() => handleImageLoad(uri)}
                                onError={() => handleImageError(uri)}
                                onLoadStart={() => setImageLoading(uri, true)}
                              />
                            ) : (
                              <View style={styles.imageErrorView}>
                                <Icon name="image-broken-variant" size={40} color="#999" />
                              </View>
                            )}
                            <Text style={styles.imageIndex}>{i + 1}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noMediaText}>{!isOnline ? "Media unavailable (offline)" : "No media available"}</Text>
                  )}
                </View>
              {(item.status === "alert" && item.is_deleted === false) && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident info</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('removereport')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {item.status === "done" && item.is_deleted === false && (
                <TouchableOpacity>
                  <View style={styles.doneNoticeBox}>
                    <Text style={styles.doneNoticeTitle}>Incident Done</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('done')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {(item.status === "cancelled" || item.is_deleted === true) && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('youcancel')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              {(item.status === "ongoing" && item.is_deleted === false) && (
                <View style={styles.ongoingNoticeBox}>
                  <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                  <Text style={styles.ongoingNoticeText}>
                    {t('reportongoing')}
                  </Text>
                </View>
              )}
              {(item.status === "alert" && item.is_deleted === false) && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: 'red', marginLeft: 10 }]}
                  onPress={() => {
                    console.log('[RemoveReport] Remove button pressed', { reportId: item.report_id, status: item.status });
                    removeReport(item.report_id);
                  }}
                >
                  <Text style={styles.buttonText}>{t('remove')}</Text>
                </TouchableOpacity>
              )}
            </View>
            );
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchIncidents} />
          }
        />
      )}
      <ImageViewing
        images={selectedMedia.map((uri) => ({ uri }))}
        imageIndex={currentImageIndex}
        visible={fullImageViewerVisible}
        onRequestClose={() => setFullImageViewerVisible(false)}
        onImageIndexChange={(index) => setCurrentImageIndex(index)}
        backgroundColor="rgba(0, 0, 0, 0.95)"
        FooterComponent={({ imageIndex }) => (
          <View style={styles.imageFooter}>
            <Text style={styles.imageFooterText}>
              {imageIndex + 1} / {selectedMedia.length}
            </Text>
          </View>
        )}
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
    borderRadius: 5,
    backgroundColor: "#fff",
    color: "#000",
  },
  card: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  mediaContainer: { 
    marginVertical: 15,
    backgroundColor: "#fafafa",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e8e8e8"
  },
  mediaTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  imageWrapper: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#e8e8e8",
    borderWidth: 2,
    borderColor: "#d0d0d0"
  },
  imageErrorWrapper: {
    borderColor: "#ff6b6b",
    backgroundColor: "#ffe8e8"
  },
  image: { 
    width: 150, 
    height: 150, 
    resizeMode: "cover"
  },
  imageLoadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    zIndex: 10
  },
  imageErrorView: {
    width: 150,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffe8e8"
  },
  imageIndex: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: "bold"
  },
  noMediaText: {
    marginTop: 10,
    fontSize: 14,
    color: "#999"
  },
  imageFooter: {
    paddingBottom: 20,
    alignItems: "center"
  },
  imageFooterText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa"
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#007BFF",
    fontWeight: "600"
  },
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
