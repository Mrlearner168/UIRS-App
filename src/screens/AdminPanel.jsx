import { SERVER_URL } from "@env";
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import { Image as ExpoImage } from "expo-image";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
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
  const [imageLoadingState, setImageLoadingState] = useState({}); // Track loading state per image
  const [fullImageViewerVisible, setFullImageViewerVisible] = useState(false);
  const pendingRequestsRef = useRef({}); // Prevent duplicate requests
  const [fullImageIndex, setFullImageIndex] = useState(0);
  const [loadingIncidentDetails, setLoadingIncidentDetails] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);

  const { t } = useTranslation();
  const intervalRef = useRef(null);
  const isFetchingRef = useRef(false);
  const navigation = useNavigation();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const loadingTips = [
    t('loading') || 'Loading incidents...',
    'Fetching latest emergency reports...',
    'Syncing data with server...',
    'Organizing incident information...'
  ];
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

  // Handle image load with error state tracking
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

  // Enhanced loading animation
  useEffect(() => {
    if (!initialLoading) return;

    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnim.start();

    return () => {
      pulseAnim.stop();
    };
  }, [initialLoading]);

  // Cycle loading tips
  useEffect(() => {
    if (!initialLoading) return;
    const tipInterval = setInterval(() => {
      setLoadingTipIndex(prev => (prev + 1) % loadingTips.length);
    }, 2000);
    return () => clearInterval(tipInterval);
  }, [initialLoading, loadingTips.length]);

  useEffect(() => {
    const loadCached = async () => {
      const cached = await EncryptedStorage.getItem("cached_incidents");
      if (cached) setIncidents(JSON.parse(cached));
      setInitialLoading(false);
    };
    loadCached();
  }, []);

  // Auto-fetch and verify token when screen focused
  useFocusEffect(
    useCallback(() => {
      const verifyTokenAndFetch = async () => {
        try {
          const token = await EncryptedStorage.getItem('token');
          if (!token) {
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
            return;
          }
          const updated = await fetchAndCacheIncidents();
          if (updated) setIncidents(updated);
          await fetchReportCounts();
        } catch (error) {
          console.error('Token verification failed:', error);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      };
      verifyTokenAndFetch();
    }, [fetchAndCacheIncidents, fetchReportCounts, navigation])
  );

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
  //console.log("All Incidents:", JSON.stringify(incidents, null, 2));
  const filteredIncidents = incidents.filter(
    (incident) =>
      (!statusFilter || incident.status === statusFilter) &&
      (incident.incidentType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.incidentDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.contactInfo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      incident.reporter_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  //console.log("Filtered Incidents:", JSON.stringify(filteredIncidents, null, 2));
  return (
    <View style={styles.container}>

      <TextInput
        style={styles.searchInput}
        placeholder={t('search')}
        placeholderTextColor="#888"
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
          {t('offline')}(media unavailable)
        </Text>
      )}

      {initialLoading ? (
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <Animated.View
              style={[
                styles.loadingIconWrapper,
                {
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <ActivityIndicator size="large" color="#007BFF" />
            </Animated.View>
            <Text style={styles.loadingMainText}>Loading Dashboard</Text>
            <Text style={styles.loadingTipText}>
              {loadingTips[loadingTipIndex]}
            </Text>
            <View style={styles.loadingDotsContainer}>
              {[0, 1, 2].map((dot) => (
                <View
                  key={dot}
                  style={styles.loadingDot}
                />
              ))}
            </View>
          </View>
        </View>
      ) : filteredIncidents.length === 0 ? (
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
                      {t('newin')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 16, marginTop: 10, marginBottom: 10 }}>
                {t('reportedby')} {item.reporter_name || "Unknown"}
              </Text>
              <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                <Text style={styles.locationText}>
                  {t('location')} {item.readable_location || item.readableLocation || item.location}
                </Text>
              </TouchableOpacity>
              <Text>{t('incidenttype')} {item.incidentType}</Text>
              { item.incidentType !== "Others" && (
                <Text>Sub-Type: {item.subType || "N/A"}</Text>
              )}
              { item.incidentType === "Others" && (
              <Text>{t('description')} {item.incidentDescription}</Text>
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
              <TouchableOpacity
                onPress={() => {
                  if (item.contactInfo)
                    Linking.openURL(`tel:${item.contactInfo}`).catch((err) =>
                      console.log("Failed to open dialer:", err)
                    );
                }}
              >
                <Text style={{ color: "blue", textDecorationLine: "underline" }}>
                  {t('contact')} {item.contactInfo || "No contact"}
                </Text>
              </TouchableOpacity>
              <Text>{t('status')}</Text>
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
                  {t('reportcount')} {reportCounts.counts ? reportCounts.counts[item.id] : 0}
                </Text>
              </TouchableOpacity>
              <Text>
                {t('totalrep')} (%): {reportCounts.percentages ? `${reportCounts.percentages[item.id]}%` : "0%"}
              </Text>

              {item.stations && item.status !== "cancelled" && item.stations.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontWeight: "bold" }}>{t('assignstation')}</Text>
                            
                  {/* Custom Picker */}
                  <TouchableOpacity
                    style={styles.pickerBox}
                    onPress={() => setPickerVisibleIncidentId(item.id)}
                  >
                    <Text style={{ color: "#000" }}>
                      {(item.selectedStation &&
                        item.stations.find(st => st.station_id_str === item.selectedStation)?.station_name) ||
                        item.stations.find(st => st.status === "assigned")?.station_name ||
                        t('pending')}
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
                            {t('contact')} {selected.contact || t('nocontact')}
                          </Text>
                        </TouchableOpacity>
                        
                        <Text>
                          {t('responders')}{" "}
                          {item.responder_details
                            ?.filter(resp => resp.station_id === selected.station_id)
                            .map(resp => `${resp.responder_name} (${resp.status})`)
                            .join(", ") || t('noresponders')}
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
                <Text style={styles.trackButtonText}>{t('tracklocation')}</Text>
              </TouchableOpacity>
              )}
              {item.status === "cancelled" && (
                <TouchableOpacity>
                  <View style={styles.cancelNoticeBox}>
                    <Text style={styles.cancelNoticeTitle}>Incident Cancelled</Text>
                    <Text style={styles.ongoingNoticeText}>
                      {t('cancelled')}
                    </Text>
                  </View>
                </TouchableOpacity>
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
              <View style={styles.mediaContainer}>
                <Text style={styles.mediaTitle}>
                  📷 Media Evidence ({item.media?.length || 0} files)
                </Text>
                {isOnline && item.media && item.media.length > 0 ? (
                  <View style={styles.mediaGrid}>
                    {item.media.map((mediaItem, index) => {
                      const imageState = imageLoadingState[mediaItem] || { loading: true, error: false, loaded: false };
                      const isError = imageState.error;
                      const isLoading = imageState.loading && !imageState.loaded;
                      
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[styles.imageWrapper, isError && styles.imageErrorWrapper]}
                          onPress={() => {
                            if (!isError) {
                              setSelectedMedia(item.media.filter(m => !imageLoadingState[m]?.error));
                              setCurrentImageIndex(item.media.filter(m => !imageLoadingState[m]?.error).indexOf(mediaItem));
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
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Full Screen Image Viewer */}
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

      {reportersModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontWeight: "bold", marginBottom: 10, fontSize: 16 }}>
              📋 Reporters Information
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {currentReporters.length > 0 ? (
                currentReporters.map((name, index) => (
                  <Text key={index} style={styles.reporterItem}>
                    {index + 1}. {name.trim()}
                  </Text>
                ))
              ) : (
                <Text style={styles.reporterItem}>No reporter data available</Text>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setReportersModalVisible(false)}
            >
              <Text style={{ color: "#fff", textAlign: "center", fontWeight: "bold" }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, backgroundColor: "#fff" },
  heading: { 
    fontSize: 22, 
    fontWeight: "bold", 
    marginBottom: 20, 
    marginTop: 18, 
    textAlign: "center",
    color: "#333"
  },
  noReportsText: { 
    textAlign: "center", 
    marginTop: 30, 
    fontSize: 20,
    color: "#999"
  },
  searchInput: { 
    borderLeftWidth: 3, 
    borderRightWidth: 3, 
    height: 45, 
    borderColor: "gray", 
    borderWidth: 1, 
    marginBottom: 10, 
    marginLeft: 10, 
    marginRight: 10, 
    paddingHorizontal: 20, 
    borderRadius: 5,
    backgroundColor: "#f0f0f0",
    color: "#000",
    fontSize: 16
  },
  card: { 
    backgroundColor: "#f9f9f9", 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
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
  locationText: { 
    color: "blue", 
    textDecorationLine: "underline",
    marginVertical: 4,
    fontSize: 14
  },
  trackButton: { 
    backgroundColor: "#007BFF", 
    padding: 12, 
    borderRadius: 5, 
    marginTop: 10,
    alignItems: "center"
  },
  trackButtonText: { 
    color: "#fff", 
    textAlign: "center", 
    fontWeight: "bold",
    fontSize: 16
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    width: "85%",
    maxHeight: "70%",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8
  },
  reporterItem: {
    fontSize: 14,
    color: "#333",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  closeButton: {
    backgroundColor: "#28a745",
    padding: 12,
    borderRadius: 5,
    marginTop: 15,
    alignItems: "center"
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
    backgroundColor: '#E8F5E9',
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
  loadingContent: {
    alignItems: "center",
    paddingHorizontal: 40,
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

export default AdminPanel;
