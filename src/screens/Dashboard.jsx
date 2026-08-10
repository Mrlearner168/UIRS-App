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
  Keyboard,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
  
  // Search and Suggestions State
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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

  // Auto-suggestion logic spanning all data
  const handleSearchChange = (text) => {
    setSearchQuery(text);
    if (text.trim().length > 0) {
      const textLower = text.toLowerCase().trim();
      const newSuggestions = new Set();
      
      incidents.forEach((incident) => {
        // Collect exact matches for shorter fields
        const exactFields = [
          incident.incidentType,
          incident.subType,
          incident.processed_location,
          incident.readableLocation,
          incident.contactInfo,
          incident.status
        ];

        exactFields.forEach(field => {
          if (field && typeof field === 'string' && field.toLowerCase().includes(textLower)) {
            newSuggestions.add(field);
          }
        });

        // For description, include it but truncate if it's too long so the UI stays clean
        if (incident.incidentDescription && typeof incident.incidentDescription === 'string' && incident.incidentDescription.toLowerCase().includes(textLower)) {
          let desc = incident.incidentDescription;
          if (desc.length > 40) {
            desc = desc.substring(0, 40) + '...';
          }
          newSuggestions.add(desc);
        }
      });

      // Filter out any empty items and limit to top 6 suggestions
      const suggestionsArray = Array.from(newSuggestions).filter(Boolean).slice(0, 6); 
      setSuggestions(suggestionsArray);
      setShowSuggestions(suggestionsArray.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    // If the suggestion ends with '...', it was truncated. Strip it before setting query
    const query = suggestion.endsWith('...') ? suggestion.slice(0, -3) : suggestion;
    setSearchQuery(query);
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

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
  const getSeverityLabel = (severity_level) => {
    const severityMap = {
      1: "Low",
      2: "Moderate",
      3: "High",
      4: "Critical",
      5: "Extreme",
    };

    return severityMap[severity_level] || "Unknown";
  };
    
    // Ensure we are checking it as a string for easy matching
  const getSeverityColor = (severity_level) => {
    switch (Number(severity_level)) {
      case 5:
      case 'critical':
      case 'extreme':
        return '#8B0000'; // Dark Red - Highest urgency
      case 4:
      case 'severe':
      case 'major':
        return '#DC3545'; // Bright Red
      case 3:
      case 'high':
      case 'moderate':
        return '#FD7E14'; // Orange
      case 2:
      case 'medium':
      case 'minor':
        return '#FFC107'; // Yellow
      case 1:
      case 'low':
        return '#28A745'; // Green - Lowest urgency
      default:
        return '#6C757D'; // Gray - Fallback for missing/unknown data
    }
  };
  // Updated filteredIncidents to check all data points
  const filteredIncidents = incidents
    .filter((incident) => {
      if (!incident) return false;
      const searchLower = (searchQuery || "").toLowerCase().trim();
      if (!searchLower) return true; // Show all if no search query

      return (
        (incident.incidentType?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.subType?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.location?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.readableLocation?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.processed_location?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.incidentDescription?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.contactInfo?.toLowerCase?.() || "").includes(searchLower) ||
        (incident.status?.toLowerCase?.() || "").includes(searchLower)
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
  

  return (
    <View style={styles.container}>
      
      {/* 
        1. Wrap ONLY the top section to handle keyboard dismissal.
        2. Ensure exactly ONE <View> is inside TouchableWithoutFeedback.
      */}
      <TouchableWithoutFeedback
        onPress={() => {
          setShowSuggestions(false);
          Keyboard.dismiss();
        }}
      >
        <View>
          <Text style={styles.heading}>
            {t('yourreports')}{" "}
            <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? 'green' : 'red'} />
            {isOnline ? " Online" : " Offline"}
          </Text>

          {/* Beautiful Search Bar */}
          <View style={styles.searchContainer}>
            <View style={[styles.searchBarWrapper, isSearchFocused && styles.searchBarFocused]}>
              <Icon name="magnify" size={24} color={isSearchFocused ? "#007BFF" : "#888"} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('search') || "Search reports..."}
                placeholderTextColor={"#aaa"}
                value={searchQuery}
                onChangeText={handleSearchChange}
                onFocus={() => {
                  setIsSearchFocused(true);
                  if (searchQuery.length > 0 && suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => setIsSearchFocused(false)}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
                  <Icon name="close-circle" size={20} color="#bbb" />
                </TouchableOpacity>
              )}
            </View>

            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {suggestions.map((item, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={[styles.suggestionItem, index === suggestions.length - 1 && styles.suggestionItemLast]} 
                    onPress={() => handleSuggestionSelect(item)}
                  >
                    <Icon name="magnify" size={16} color="#aaa" style={styles.suggestionIcon} />
                    <Text style={styles.suggestionText} numberOfLines={1}>{item}</Text>
                    <Icon name="arrow-top-left" size={16} color="#ddd" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* The rest of your components remain OUTSIDE the Touchable so the list can scroll */}
      
      {!isOnline && <Text style={{ textAlign: "center", color: "red", marginTop: 5 }}>{t('offline')}(media unavailable)</Text>}

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
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item, index) => item?.id?.toString() || index.toString()}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => {
            if (!item) return null;
            return (
              <View style={[styles.card,{borderLeftColor: getSeverityColor(item.severity_level)}]}>
                <Text>{t('incidenttype')}{item.incidentType || 'Unknown'}</Text>
                <Text>{t('subtype')}{item.subType || 'Unknown'}</Text>
                {item.location && (
                  <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                    <Text style={styles.locationText}>
                      {t('location')}{item.processed_location || item.readableLocation || 'Location unavailable'}
                    </Text>
                  </TouchableOpacity>
                )}
                <Text>{t('severity: ')}{getSeverityLabel(item.severity_level)}</Text>
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
                                cachePolicy="none"
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
  container: { flex: 1, padding: 14, backgroundColor: '#f2f2f2' },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 15, marginTop: 20, textAlign: "center", color: '#333' },
  noReportsText: { textAlign: "center", marginTop: 30, fontSize: 18, color: '#666' },
  button: { padding: 10, borderRadius: 12, marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', textAlign: 'center' },
  
  // -- Beautiful Search Bar Styles --
  searchContainer: {
    zIndex: 100, // Important so suggestions render over flatlist
    marginBottom: 15,
    marginHorizontal: 4,
    position: 'relative',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 25,
    paddingHorizontal: 15,
    height: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4, // Android shadow
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchBarFocused: {
    borderColor: '#007BFF',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: '100%',
  },
  clearButton: {
    padding: 5,
    marginLeft: 5,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 58, // positioned cleanly below the search bar
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 1000,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  suggestionItemLast: {
    borderBottomWidth: 0, // Remove line for last item
  },
  suggestionIcon: {
    marginRight: 12,
  },
  suggestionText: {
    fontSize: 15,
    color: '#444',
    flex: 1,
    marginRight: 10,
  },
  // -- End Search Bar Styles --

  card: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,

    borderLeftWidth: 6,      // Determines how thick the severity stripe is
    borderLeftColor: '#ccc', // A fallback color just in case
  },
  mediaContainer: { 
    marginVertical: 15,
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee"
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
    borderWidth: 1,
    borderColor: "#e0e0e0"
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
    backgroundColor: "transparent"
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#007BFF",
    fontWeight: "600"
  },
  locationText: { color: "#007BFF", textDecorationLine: "underline", marginVertical: 4 },
  trackButton: { backgroundColor: "#007BFF", padding: 12, borderRadius: 8, marginTop: 12 },
  trackButtonText: { color: "#fff", textAlign: "center", fontWeight: "bold", fontSize: 15 },
  ongoingNoticeBox: {
    backgroundColor: '#FFF4E5',
    borderLeftWidth: 5,
    borderLeftColor: '#FFA500',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  ongoingNoticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 4,
  },
  doneNoticeBox: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 5,
    borderLeftColor: '#22ec29',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  doneNoticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#22ec29',
    marginBottom: 4,
  },
  cancelNoticeBox: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 5,
    borderLeftColor: '#e10d0d',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  cancelNoticeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e10d0d',
    marginBottom: 4,
  },
  ongoingNoticeText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  date: {
    color: '#666',
    marginTop: 4,
    fontSize: 13,
  }
});

export default UserListReports;