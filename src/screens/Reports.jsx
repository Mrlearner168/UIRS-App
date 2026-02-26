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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);
  const [readableAddressCache, setReadableAddressCache] = useState({});
  const [isOnline, setIsOnline] = useState(true);
  const [imageLoadingState, setImageLoadingState] = useState({});
  const [fullImageViewerVisible, setFullImageViewerVisible] = useState(false);
  const navigation = useNavigation();
  const { t } = useTranslation();
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

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

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

  useEffect(() => {
    if (!loading) return;
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    pulseAnim.start();
    return () => pulseAnim.stop();
  }, [loading, scaleAnim]);

  useEffect(() => {
    if (!loading) return;
    const tipInterval = setInterval(() => {
      setLoadingTipIndex(prev => (prev + 1) % loadingTips.length);
    }, 2000);
    return () => clearInterval(tipInterval);
  }, [loading, loadingTips.length]);

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

  const reverseGeocodeWithQueueFn = useCallback(async (lat, lon, retries = 0) => {
    try {
      if (!locationPermissionRef.current) return "Location unavailable";
      const geocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
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
      return "Address unavailable";
    }
  }, []);

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
        item.callback("Error fetching address");
      } finally {
        activeGeocodesRef.current--;
        processLocationQueue();
      }
    }
  }, [reverseGeocodeWithQueueFn]);

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
        const incidentsWithMedia = response.data.map(incident => ({
          id: incident.id || incident.report_id || incident._id,
          ...incident,
          readableLocation: readableAddressCache[incident.location] || "Fetching location...",
          media: typeof incident.media === 'string' 
            ? incident.media.split(',').map(uri => uri.trim()).slice(0, 20)
            : (incident.media?.slice(0, 20) || [])
        }));

        setIncidents(incidentsWithMedia);

        const textOnly = incidentsWithMedia.map(({ media, ...rest }) => rest);
        await EncryptedStorage.setItem("cached_incidents", JSON.stringify(textOnly));

        batchProcessAddresses(response.data);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to fetch incidents.");
      try {
        const cached = await EncryptedStorage.getItem("cached_incidents");
        if (cached) setIncidents(JSON.parse(cached));
      } catch (cacheError) {}
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isOnline, readableAddressCache, batchProcessAddresses]);
  
  useFocusEffect(useCallback(() => { fetchIncidents(); }, [fetchIncidents]));

  useEffect(() => {
    if (isOnline) fetchIncidents();
  }, [isOnline]);

  const openGoogleMaps = (location) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
    Linking.openURL(url).catch(err => console.log("Failed to open Google Maps:", err));
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
              const response = await axios.delete(`${SERVER_URL}/delete_report/${reportId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            
              if (response.status === 200) {
                setIncidents(prev => prev.filter(r => r.id !== reportId));
                await fetchIncidents();
                Alert.alert("Success", t('reportremove'));
              } else {
                Alert.alert("Error", response.data?.message || "Failed to delete report.");
              }
            } catch (error) {
              Alert.alert("Error", t('failedremove'));
            }
          },
        },
      ]
    );
  };

  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const terms = new Set();

    incidents.forEach(inc => {
      if (inc.incidentType?.toLowerCase().includes(query)) terms.add(inc.incidentType);
      if (inc.subType?.toLowerCase().includes(query)) terms.add(inc.subType);
      if (inc.status?.toLowerCase().includes(query)) terms.add(inc.status);
    });
    return Array.from(terms).slice(0, 5);
  }, [incidents, searchQuery]);

  const filteredIncidents = useMemo(() => {
    if (!searchQuery.trim()) return incidents.sort((b, a) => new Date(a.created_at) - new Date(b.created_at));
    const query = searchQuery.toLowerCase();
    return incidents.filter((incident) => {
      const searchableString = `
        ${incident.incidentType || ""} 
        ${incident.subType || ""} 
        ${incident.location || ""} 
        ${incident.readableLocation || ""} 
        ${incident.processed_location || ""} 
        ${incident.incidentDescription || ""} 
        ${incident.contactInfo || ""} 
        ${incident.status || ""}
        ${incident.incidentTime || ""}
      `.toLowerCase();
      return searchableString.includes(query);
    }).sort((b, a) => new Date(a.created_at) - new Date(b.created_at));
  }, [incidents, searchQuery]);

  // UI Helpers
  const getStatusConfig = (status, isDeleted) => {
    if (isDeleted) return { text: "Deleted", bg: "#FFE5E5", color: "#D32F2F", icon: "delete-outline" };
    switch (status) {
      case "done": return { text: "Completed", bg: "#E8F5E9", color: "#2E7D32", icon: "check-circle-outline" };
      case "ongoing": return { text: "Ongoing", bg: "#FFF3E0", color: "#F57C00", icon: "loop" };
      case "cancelled": return { text: "Cancelled", bg: "#FFE5E5", color: "#D32F2F", icon: "cancel" };
      case "alert": return { text: "Alert", bg: "#E3F2FD", color: "#1976D2", icon: "notification-important" };
      default: return { text: status || "Unknown", bg: "#F5F5F5", color: "#757575", icon: "info-outline" };
    }
  };

  return (
    <View style={styles.container}>
      {/* SEARCH BAR */}
      <View style={{ zIndex: 10, elevation: 10 }}> 
        <View style={styles.searchHeaderContainer}>
          <Icon name="search" size={24} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search') || "Search reports..."}
            placeholderTextColor={'#888'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearIcon}>
              <Icon name="close" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        {isSearchFocused && searchSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {searchSuggestions.map((suggestion, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.suggestionItem}
                onPress={() => {
                  setSearchQuery(suggestion);
                  setIsSearchFocused(false);
                }}
              >
                <Icon name="history" size={18} color="#888" style={{ marginRight: 10 }} />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Icon name="wifi-off" size={16} color="#D32F2F" />
          <Text style={styles.offlineText}>Offline mode: showing cached reports</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <Animated.View style={[styles.loadingIconWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <ActivityIndicator size="large" color="#007BFF" />
          </Animated.View>
          <Text style={styles.loadingMainText}>Loading Reports</Text>
          <Text style={styles.loadingTipText}>{loadingTips[loadingTipIndex]}</Text>
        </View>
      ) : filteredIncidents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="inbox" size={60} color="#ccc" />
          <Text style={styles.noReportsText}>{t('norep') || "No reports found."}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredIncidents}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => {
            const statusCfg = getStatusConfig(item.status, item.is_deleted);
            
            return (
              <View style={styles.card}>
                
                {/* Header Row: Type & Status */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleContainer}>
                    <Text style={styles.incidentTitle}>{item.incidentType}</Text>
                    {item.incidentType !== "Others" && item.subType && (
                      <View style={styles.subTypeBadge}>
                        <Text style={styles.subTypeText}>{item.subType}</Text>
                      </View>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                    <Icon name={statusCfg.icon} size={14} color={statusCfg.color} />
                    <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.text}</Text>
                  </View>
                </View>

                {/* Body Rows */}
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <Icon name="location-pin" size={18} color="#007BFF" style={styles.infoIcon} />
                    <TouchableOpacity onPress={() => openGoogleMaps(item.location)} style={styles.infoTextContainer}>
                      <Text style={styles.locationLinkText} numberOfLines={2}>
                        {item.processed_location || item.readableLocation}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Icon name="access-time" size={18} color="#666" style={styles.infoIcon} />
                    <Text style={styles.infoText}>{item.incidentTime}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Icon name="calendar-today" size={18} color="#666" style={styles.infoIcon} />
                    <Text style={styles.infoText}>
                      {new Date(item.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </Text>
                  </View>
                </View>

                {item.incidentType === "Others" && item.incidentDescription && (
                  <View style={styles.descriptionBox}>
                    <Text style={styles.descriptionLabel}>Description:</Text>
                    <Text style={styles.descriptionText}>{item.incidentDescription}</Text>
                  </View>
                )}

                {/* Media Section */}
                <View style={styles.mediaContainer}>
                  <View style={styles.mediaHeaderRow}>
                    <Icon name="photo-library" size={16} color="#444" />
                    <Text style={styles.mediaTitle}>Evidence ({item.media?.length || 0})</Text>
                  </View>
                  
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
                                <ActivityIndicator size="small" color="#007BFF" />
                              </View>
                            )}
                            {!isError ? (
                              <ExpoImage
                                source={{ uri: mediaItem }}
                                style={[styles.image, isLoading && { opacity: 0.5 }]}
                                contentFit="cover"
                                onLoad={() => handleImageLoad(mediaItem)}
                                onError={() => handleImageError(mediaItem)}
                                onLoadStart={() => setImageLoading(mediaItem, true)}
                              />
                            ) : (
                              <View style={styles.imageErrorView}>
                                <Icon name="broken-image" size={24} color="#999" />
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noMediaText}>
                      {!isOnline ? "Media unavailable offline" : "No images attached."}
                    </Text>
                  )}
                </View>

                {/* Status Notice Banners */}
                {item.status === "ongoing" && !item.is_deleted && (
                  <View style={[styles.noticeBanner, { backgroundColor: '#FFF3E0', borderLeftColor: '#F57C00' }]}>
                    <Icon name="info" size={16} color="#F57C00" />
                    <Text style={[styles.noticeText, { color: '#E65100' }]}>{t('reportongoing')}</Text>
                  </View>
                )}
                {item.status === "done" && !item.is_deleted && (
                  <View style={[styles.noticeBanner, { backgroundColor: '#E8F5E9', borderLeftColor: '#2E7D32' }]}>
                    <Icon name="check-circle" size={16} color="#2E7D32" />
                    <Text style={[styles.noticeText, { color: '#1B5E20' }]}>{t('done')}</Text>
                  </View>
                )}
                {(item.status === "cancelled" || item.is_deleted) && (
                  <View style={[styles.noticeBanner, { backgroundColor: '#FFE5E5', borderLeftColor: '#D32F2F' }]}>
                    <Icon name="cancel" size={16} color="#D32F2F" />
                    <Text style={[styles.noticeText, { color: '#B71C1C' }]}>{t('youcancel')}</Text>
                  </View>
                )}
                {item.status === "alert" && !item.is_deleted && (
                  <View style={[styles.noticeBanner, { backgroundColor: '#E3F2FD', borderLeftColor: '#1976D2' }]}>
                    <Icon name="notification-important" size={16} color="#1976D2" />
                    <Text style={[styles.noticeText, { color: '#0D47A1' }]}>{t('removereport')}</Text>
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtonsContainer}>
                  {item.status !== "done" && item.status !== "cancelled" && !item.is_deleted && (
                    <TouchableOpacity
                      style={styles.primaryBtn}
                      onPress={() => navigation.navigate('TrackLocation', { 
                        incidentId: item.incident_id,
                        incidentLocation: item.location,
                        stationId: item.station_ids
                      })}
                    >
                      <Icon name="my-location" size={18} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryBtnText}>{t('viewdetails')}</Text>
                    </TouchableOpacity>
                  )}

                  {item.status === "alert" && !item.is_deleted && (
                    <TouchableOpacity
                      style={styles.dangerBtn}
                      onPress={() => removeReport(item.id)}
                    >
                      <Icon name="delete" size={18} color="#FFF" style={{ marginRight: 6 }} />
                      <Text style={styles.dangerBtnText}>{t('remove')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </View>
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchIncidents} tintColor="#007BFF" />}
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
          <View style={{ paddingBottom: 20, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              {imageIndex + 1} / {selectedMedia.length}
            </Text>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  listContainer: { padding: 14, paddingBottom: 40 },
  
  // --- SEARCH BAR STYLES ---
  searchHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginTop: 15,
    marginBottom: 5,
    marginHorizontal: 14,
    borderRadius: 25,
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3, 
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  searchIcon: { marginRight: 10 },
  clearIcon: { padding: 5 },
  searchInput: { flex: 1, height: 48, color: "#2C3E50", fontSize: 16 },
  suggestionsContainer: {
    position: 'absolute',
    top: 70, 
    left: 14,
    right: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    zIndex: 100, 
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F8',
  },
  suggestionText: { fontSize: 15, color: '#444' },

  // --- TOP NOTICES ---
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 8,
    marginBottom: 10,
  },
  offlineText: { color: '#D32F2F', marginLeft: 8, fontSize: 13, fontWeight: '500' },

  // --- BEAUTIFUL CARD STYLES ---
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleContainer: {
    flex: 1,
    paddingRight: 10,
  },
  incidentTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A202C",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  subTypeBadge: {
    backgroundColor: '#F0F4F8',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // --- INFO SECTION ---
  infoSection: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  locationLinkText: {
    fontSize: 14,
    color: '#0284C7',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // --- DESCRIPTION BOX ---
  descriptionBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#CBD5E1',
    paddingLeft: 12,
    marginBottom: 16,
  },
  descriptionLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // --- MEDIA SECTION ---
  mediaContainer: { 
    marginBottom: 12,
  },
  mediaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mediaTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginLeft: 6,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  imageWrapper: {
    width: 200, 
    height: 200,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  imageErrorWrapper: { borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  image: { width: "100%", height: "100%" },
  imageLoadingContainer: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center", alignItems: "center",
  },
  imageErrorView: {
    flex: 1, justifyContent: "center", alignItems: "center",
  },
  noMediaText: {
    fontSize: 13, color: "#94A3B8", fontStyle: "italic"
  },

  // --- NOTICES ---
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  noticeText: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // --- ACTION BUTTONS ---
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: "#007BFF",
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#007BFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  dangerBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: "#DC3545",
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#DC3545",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  dangerBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // --- EMPTY / LOADING STATES ---
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
  },
  noReportsText: { 
    textAlign: "center", 
    marginTop: 15, 
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500'
  },
  loadingContainer: {
    flex: 1, justifyContent: "center", alignItems: "center", marginTop: 100,
  },
  loadingIconWrapper: { marginBottom: 24 },
  loadingMainText: { fontSize: 20, fontWeight: "700", color: "#334155", marginBottom: 8 },
  loadingTipText: { fontSize: 14, color: "#007BFF", fontWeight: "500" },
});

export default UserListReports;