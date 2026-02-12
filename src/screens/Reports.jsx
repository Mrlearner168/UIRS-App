import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { Image as ExpoImage } from "expo-image";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";
import Icon from "react-native-vector-icons/MaterialIcons";
import { AuthContext } from "../context/AuthContext";

const PLACEHOLDER_URI = "https://via.placeholder.com/600x600.png?text=No+Image";
const MAX_CONCURRENT_GEOCODES = 3;
const GEOCODE_RETRY_LIMIT = 2;
const GEOCODE_RETRY_DELAY = 400;

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
  const {t} = useTranslation();
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const pendingRequestsRef = useRef({});
  const { authData } = useContext(AuthContext);
  const locationPermissionRef = useRef(null);
  const geocodeQueueRef = useRef([]);
  const activeGeocodesRef = useRef(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);

  const loadingTips = [
    t('loading') || 'Loading reports...',
    'Fetching incident details...',
    'Processing locations...',
    'Organizing your reports...'
  ];

  // Listen to network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  // Request location permission once at startup
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        locationPermissionRef.current = status === "granted";
      } catch (error) {
        console.warn("Location permission request failed:", error);
        locationPermissionRef.current = false;
      }
    };
    requestLocationPermission();
  }, []);

  // Enhanced loading animation
  useEffect(() => {
    if (!loading) return;
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnim.start();
    return () => pulseAnim.stop();
  }, [loading, scaleAnim]);

  // Cycle loading tips
  useEffect(() => {
    if (!loading) return;
    const tipInterval = setInterval(() => {
      setLoadingTipIndex(prev => (prev + 1) % loadingTips.length);
    }, 2000);
    return () => clearInterval(tipInterval);
  }, [loading, loadingTips.length]);

  // Image loading and error handling
  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: false, loaded: true }
    }));
    delete pendingRequestsRef.current[uri]; // Remove from pending
  }, []); // Empty dependency array

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: true, loaded: false }
    }));
    delete pendingRequestsRef.current[uri]; // Remove from pending
  }, []);

  const setImageLoading = useCallback((uri, loading) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { ...prev[uri], loading }
    }));
  }, []);

  // Enhanced reverse geocode with queue management and retries
  const reverseGeocodeWithQueueFn = useCallback(async (lat, lon, retries = 0) => {
    try {
      if (!locationPermissionRef.current) {
        return "Location unavailable";
      }

      const geocode = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });

      if (geocode && geocode.length > 0) {
        const { street, city, region } = geocode[0];
        return `${street || "Unknown Street"}, ${city || "Unknown City"}, ${region || "Unknown Region"}`;
      }
      return "Address not found";
    } catch (error) {
      if (retries < GEOCODE_RETRY_LIMIT) {
        await new Promise(res => setTimeout(res, GEOCODE_RETRY_DELAY));
        return reverseGeocodeWithQueueFn(lat, lon, retries + 1);
      }
      console.log("Geocode failed after retries");
      return "Address unavailable";
    }
  }, []);

  // Batch location processing with concurrency control
  const processLocationQueue = useCallback(async () => {
    while (geocodeQueueRef.current.length > 0 && activeGeocodesRef.current < MAX_CONCURRENT_GEOCODES) {
      const item = geocodeQueueRef.current.shift();
      if (!item) break;

      activeGeocodesRef.current++;
      try {
        const [lat, lon] = item.location.split(",").map(Number);
        const readable = await reverseGeocodeWithQueueFn(lat, lon);
        item.callback(readable);
      } catch (error) {
        console.log("Queue processing error:", error);
        item.callback("Error fetching address");
      } finally {
        activeGeocodesRef.current--;
        processLocationQueue();
      }
    }
  }, [reverseGeocodeWithQueueFn]);

  // Batch process missing addresses
  const batchProcessAddresses = useCallback((incidentsList) => {
    const missingAddresses = incidentsList
      .filter(incident => !readableAddressCache[incident.location])
      .map(incident => incident.location);

    if (missingAddresses.length === 0) return;

    missingAddresses.forEach(location => {
      const [lat, lon] = location.split(",").map(Number);
      geocodeQueueRef.current.push({
        location,
        callback: (readable) => {
          setReadableAddressCache(prev => ({ ...prev, [location]: readable }));
        }
      });
    });

    processLocationQueue();
  }, [readableAddressCache, processLocationQueue]);

  // Fetch incidents with optimized caching and batch processing
  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      if (!isOnline) {
        const cached = await EncryptedStorage.getItem("cached_incidents");
        if (cached) {
          const incidentsList = JSON.parse(cached);
          setIncidents(incidentsList);
          batchProcessAddresses(incidentsList);
        }
        return;
      }

      const token = await EncryptedStorage.getItem("token");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const response = await axios.get(`${SERVER_URL}/user_reports`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      if (Array.isArray(response.data)) {
        // Process data quickly without waiting for all addresses
        const incidentsWithMedia = response.data.map(incident => ({
          id: incident.id || incident.report_id || incident._id,
          ...incident,
          readableLocation: readableAddressCache[incident.location] || "Fetching location...",
          media: typeof incident.media === 'string' 
            ? incident.media.split(',').map(uri => uri.trim()).slice(0, 20)
            : (incident.media?.slice(0, 20) || [])
        }));

        setIncidents(incidentsWithMedia);

        // Cache without full address processing
        const textOnly = incidentsWithMedia.map(({ media, ...rest }) => rest);
        await EncryptedStorage.setItem("cached_incidents", JSON.stringify(textOnly));

        // Batch process missing addresses in background
        batchProcessAddresses(response.data);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      Alert.alert("Error", "Failed to fetch incidents.");
      
      // Fallback to cache on network error
      try {
        const cached = await EncryptedStorage.getItem("cached_incidents");
        if (cached) setIncidents(JSON.parse(cached));
      } catch (cacheError) {
        console.log("Cache fallback failed:", cacheError);
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isOnline, readableAddressCache, batchProcessAddresses]);
  console.log("fetch incidents:", incidents.length, "items");
  // Auto refresh when screen focused
  useFocusEffect(
    useCallback(() => {
      fetchIncidents();
    }, [fetchIncidents])
  );

  // Auto refresh when network reconnects
  useEffect(() => {
    if (isOnline) fetchIncidents();
  }, [isOnline]);

  const openGoogleMaps = (location) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
    Linking.openURL(url).catch(err => console.log("Failed to open Google Maps:", err));
  };

  const openImageModal = (mediaArray, index) => {
    setSelectedMedia(mediaArray);
    setCurrentImageIndex(index);
    setModalVisible(true);
  };
  const removeReport = async (reportId) => {
    Alert.alert(
      "Confirm Delete",
      t('removeinfo'),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('remove'),
          style: "destructive",
          onPress: async () => {
            try {
              const token = await EncryptedStorage.getItem("token");
              console.log("Deleting report:", reportId, "with token:", token);
            
              const response = await axios.delete(`${SERVER_URL}/delete_report/${reportId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            
              console.log("Delete response:", response.status, response.data);
            
              if (response.status === 200) {
                setIncidents(prev => prev.filter(r => r.id !== reportId));
                await fetchIncidents();
                Alert.alert("Success", t('reportremove'));
              } else {
                console.log("Delete failed with status:", response.status, response.data);
                Alert.alert("Error", response.data?.message || "Failed to delete report.");
              }
            } catch (error) {
              if (error.response) {
                console.error("Delete failed. Status:", error.response.status, "Data:", error.response.data);
              } else {
                console.error("Delete error:", error.message);
              }
              Alert.alert("Error", t('failedremove'));
            }
          },
        },
      ]
    );
  };
  //console.log("rendering users data:" , JSON.stringify(incidents, null, 2));
  // Memoize filtered incidents to prevent unnecessary map operations
  const filteredIncidents = useMemo(
    () => incidents.filter((incident) =>
      incident.incidentType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.incidentDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.contactInfo?.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((b, a) => new Date(a.created_at) - new Date(b.created_at)),
    [incidents, searchQuery]
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer1}>
        <Text style={styles.heading}>{t('yourreports')}</Text>
        <Icon
          name={isOnline ? "wifi" : "wifi-off"}
          size={20}
          color={isOnline ? "green" : "red"}
          style={{ marginLeft: 8 }}
        />
      </View>
        
      <TextInput
        style={styles.searchInput}
        placeholder={t('search')}
        placeholderTextColor={'#888'}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      

      {!isOnline && <Text style={{ textAlign: "center", color: "red" }}>Offline mode: showing cached reports (media unavailable)</Text>}

      {loading ? (
        <View style={styles.loadingContainer}>
          <Animated.View style={[styles.loadingIconWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <ActivityIndicator size="large" color="#007BFF" />
          </Animated.View>
          <Text style={styles.loadingMainText}>Loading Reports</Text>
          <Text style={styles.loadingTipText}>{loadingTips[loadingTipIndex]}</Text>
          <View style={styles.loadingDotsContainer}>
            {[0, 1, 2].map((dot) => <View key={dot} style={styles.loadingDot} />)}
          </View>
        </View>
      ) : filteredIncidents.length === 0 ? (
        <Text style={styles.noReportsText}>{t('norep')}</Text>
      ) : (
        <FlatList
          data={filteredIncidents}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text>{t('incidenttype')} {item.incidentType}</Text>
              {item.incidentType !== "Others" &&(
                <Text>{t('subtype')}{item.subType}</Text>
              )}
              <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                <Text style={styles.locationText}>
                  {t('location')}{item.processed_location || item.readableLocation}
                </Text>
              </TouchableOpacity>
              {item.incidentType === "Others" && <Text>Description: {item.incidentDescription}</Text>}
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
              {item.status !== "done" && item.status !== "cancelled" && item.is_deleted === false &&(
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
                    {(typeof item.media === 'string' ? item.media.split(',').map(uri => uri.trim()) : item.media).map((mediaItem, index) => {
                      const imageState = imageLoadingState[mediaItem] || { loading: true, error: false, loaded: false };
                      const isError = imageState.error;
                      const isLoading = imageState.loading && !imageState.loaded;

                      return (
                        <TouchableOpacity
                          key={index}
                          style={[styles.imageWrapper, isError && styles.imageErrorWrapper]}
                          onPress={() => {
                            if (!isError) {
                              const mediaArray = typeof item.media === 'string' ? item.media.split(',').map(u => u.trim()) : item.media;
                              setSelectedMedia(mediaArray.filter(m => !imageLoadingState[m]?.error));
                              setCurrentImageIndex(mediaArray.filter(m => !imageLoadingState[m]?.error).indexOf(mediaItem));
                              setFullImageViewerVisible(true);
                            }
                          }}
                          disabled={isError}
                        >
                          {isLoading && (
                            <View style={styles.imageLoadingContainer}>
                              <ActivityIndicator size="large" color="#007BFF" />
                              <Text style={styles.loadingText}>Loading...</Text>
                            </View>
                          )}
                          {!isError ? (
                            <ExpoImage
                              source={{ uri: mediaItem }}
                              style={[styles.image, isLoading && { opacity: 0.5 }]}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              onLoad={() => handleImageLoad(mediaItem)}
                              onError={() => handleImageError(mediaItem)}
                              onLoadStart={() => setImageLoading(mediaItem, true)}
                            />
                          ) : (
                            <View style={styles.imageErrorView}>
                              <Icon name="broken-image" size={40} color="#999" />
                              <Text style={styles.imageErrorText}>Failed to load</Text>
                            </View>
                          )}
                          <Text style={styles.imageIndex}>{index + 1}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.noMediaContainer}>
                    <TouchableOpacity onPress={() => {
                      setSelectedMedia([PLACEHOLDER_URI]);
                      setCurrentImageIndex(0);
                      setFullImageViewerVisible(true);
                    }}>
                      <Image 
                        source={{ uri: PLACEHOLDER_URI }} 
                        style={styles.placeholderImage}
                        onError={() => console.log('Placeholder image failed to load')}
                      />
                    </TouchableOpacity>
                    <Text style={styles.noMediaText}>
                      {!isOnline ? "Media unavailable (offline)" : "No images attached"}
                    </Text>
                  </View>
                )}
              </View>

              {(item.status === "alert" && item.is_deleted === false) &&(
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident info</Text>
                    <Text style={styles.ongoingNoticeText}>{t('removereport')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {item.status === "done" && item.is_deleted === false &&(
                <TouchableOpacity>
                  <View style={styles.doneNoticeBox}>
                    <Text style={styles.doneNoticeTitle}>Incident Done</Text>
                    <Text style={styles.ongoingNoticeText}>{t('done')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {(item.status === "cancelled" || item.is_deleted === true) && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                    <Text style={styles.ongoingNoticeText}>{t('youcancel')}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {item.status === "ongoing" && item.is_deleted === false &&(
                <View style={styles.ongoingNoticeBox}>
                  <Text style={styles.ongoingNoticeTitle}>Incident Ongoing</Text>
                  <Text style={styles.ongoingNoticeText}>{t('reportongoing')}</Text>
                </View>
              )}

              {item.status === "alert" && item.is_deleted === false && (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: 'red', marginLeft: 10 }]}
                  onPress={() => removeReport(item.id)}
                >
                  <Text style={styles.buttonText}>{t('remove')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchIncidents} />}
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
  headerContainer1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
  },
  heading: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#222",
  },

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
    backgroundColor: "#f0f0f0",
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
    marginLeft: 0
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
  placeholderImage: {
    width: 150,
    height: 150,
    resizeMode: "cover",
    borderRadius: 8
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
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#007BFF",
    fontWeight: "600"
  },
  imageErrorView: {
    width: 150,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffe8e8"
  },
  imageErrorText: {
    marginTop: 8,
    fontSize: 11,
    color: "#ff6b6b",
    fontWeight: "600"
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
  noMediaContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20
  },
  noMediaText: {
    marginTop: 10,
    fontSize: 14,
    color: "#999",
    fontStyle: "italic"
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
  moreImagesOverlay: {
    width: 100,
    height: 100,
    margin: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  moreImagesText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
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
  date: {
    marginVertical: 8,
    color: "#666",
    fontSize: 13
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingIconWrapper: {
    marginBottom: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingMainText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
    textAlign: "center",
  },
  loadingTipText: {
    fontSize: 16,
    color: "#007BFF",
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "500",
    minHeight: 24,
  },
  loadingDotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#007BFF",
    opacity: 0.5,
  }
});

export default UserListReports;
