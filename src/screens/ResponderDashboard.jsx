import { SERVER_URL } from '@env';
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import { Image as ExpoImage } from 'expo-image';
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
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

const ResponderViewList = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false); // NEW: Track search focus
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [resModalVisible, setResModalVisible] = useState(false);
  const [stationId, setStationId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [filterStatus, setFilterStatus] = useState("alert");
  const [userRole, setUserRole] = useState("");
  const [respondersList, setRespondersList] = useState([]);
  const [incidentId, setIncidentId] = useState(null);
  const [is_head, setIsHead] = useState(false);
  const [user_idF, setUser_id] = useState(null);
  const [imageLoadingState, setImageLoadingState] = useState({});
  const [fullImageViewerVisible, setFullImageViewerVisible] = useState(false);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  const { t } = useTranslation();
  const pendingRequestsRef = useRef({});
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const navigation = useNavigation();

  const loadingTips = [
    t('loading') || 'Loading incidents...',
    'Fetching latest reports...',
    'Processing station data...',
    'Organizing incidents...'
  ];

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  // Enhanced loading animation
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

  // Cycle loading tips
  useEffect(() => {
    if (!loading) return;
    const tipInterval = setInterval(() => {
      setLoadingTipIndex(prev => (prev + 1) % loadingTips.length);
    }, 2000);
    return () => clearInterval(tipInterval);
  }, [loading, loadingTips.length]);

  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({ ...prev, [uri]: { loading: false, error: false, loaded: true } }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({ ...prev, [uri]: { loading: false, error: true, loaded: false } }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const setImageLoading = useCallback((uri, loading) => {
    setImageLoadingState(prev => ({ ...prev, [uri]: { ...prev[uri], loading } }));
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
    setLoading(true);
    setRefreshing(true);
    try {
      if (!isOnline) {
        const cached = await EncryptedStorage.getItem("cached_responder_incidents");
        if (cached) setIncidents(JSON.parse(cached));
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const token = await EncryptedStorage.getItem("token");
      const response = await axios.get(`${SERVER_URL}/incident_data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dashboardRes = await axios.get(`${SERVER_URL}/responder_dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
        setIncidents(incidentsWithAddresses);
        const textOnly = incidentsWithAddresses.map(({ media, ...rest }) => rest);
        await EncryptedStorage.setItem("cached_responder_incidents", JSON.stringify(textOnly));
      }
    } catch (error) {
      console.log("Error fetching incidents:", error);
      Alert.alert("Error", "Failed to fetch incidents.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [isOnline]);

  useFocusEffect(
    useCallback(() => {
      const verifyTokenAndFetch = async () => {
        try {
          const token = await EncryptedStorage.getItem('token');
          if (!token) {
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            return;
          }
          await fetchIncidentsWithAddresses();
        } catch (error) {
          console.error('Token verification failed:', error);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      };
      verifyTokenAndFetch();
    }, [fetchIncidentsWithAddresses, navigation])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchIncidentsWithAddresses();
  }, [fetchIncidentsWithAddresses]);

  const handleDialPhone = (phoneNumber) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => Alert.alert("Error", "Unable to open dialer."));
  };

  const toggleIncidentStatus = async (incidentId, currentStatus, incidentLocation, stationIds) => {
    try {
      const token = await EncryptedStorage.getItem("token");
      let newStatus = currentStatus === "alert" ? "ongoing" : currentStatus === "ongoing" ? "done" : null;
      if (!newStatus) return;

      await axios.put(
        `${SERVER_URL}/update_incident_status/${incidentId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update both status properties so the UI reacts immediately
      setIncidents(prev => prev.map(i => (i.id === incidentId ? { ...i, status: newStatus, responder_status: newStatus } : i)));

      // Automatically navigate to the tracking map when incident transitions to 'ongoing'
      if (newStatus === "ongoing" && incidentLocation) {
        navigation.navigate('TrackLocation', { 
          incidentId: incidentId,
          incidentLocation: incidentLocation,
          stationId: stationIds
        });
      }
    } catch {
      Alert.alert("Error", "Unable to update status.");
    }
  };

  const openGoogleMaps = (location) => {
    const encodedLocation = encodeURIComponent(location);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodedLocation}`;
    Linking.openURL(url).catch((err) => console.log("Failed to open Google Maps:", err));
  };

  const handleToggleStatus = (status) => {
    const statusMap = {
      deleted: { color: "green", text: "Deleted" },
      assigned: { color: "brown", text: "Assigned" },
      alert: { color: "red", text: "Alert" },
      ongoing: { color: "orange", text: "Ongoing" },
      done: { color: "green", text: "Done" },
      cancelled: { color: "red", text: "Alert" },
    };
    return statusMap[status] || { color: "gray", text: "Unknown" };
  };

  // ------------------------------------------------------------------
  // SMART AUTO-SUGGESTION LOGIC (Extracts distinct data from backend list)
  // ------------------------------------------------------------------
  const searchSuggestions = useMemo(() => {
    if (!searchQuery || !isSearchFocused) return [];
    
    const query = searchQuery.toLowerCase();
    const matches = new Set();

    incidents.forEach(incident => {
      const type = incident.incidentType || "";
      const subType = incident.subType || "";
      const location = incident.readable_location || incident.readableAddress || incident.location || "";
      const reporter = incident.reporter_name || "";

      // Check which field matches and add the exact value to our suggestions list
      if (type.toLowerCase().includes(query)) matches.add(type);
      if (subType.toLowerCase().includes(query) && subType !== 'N/A') matches.add(subType);
      if (reporter.toLowerCase().includes(query)) matches.add(reporter);
      if (location.toLowerCase().includes(query)) matches.add(location);
    });

    // Return the top 5 unique matching phrases
    return Array.from(matches).slice(0, 5); 
  }, [searchQuery, incidents, isSearchFocused]);

  const filteredIncidents = useMemo(() => 
    incidents
    .filter(incident =>
      [
        incident.incidentType, 
        incident.subType,
        incident.location, 
        incident.readableAddress,
        incident.readable_location,
        incident.incidentDescription, 
        incident.contactInfo,
        incident.reporter_name
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    )
    .filter(incident => {
      if (!filterStatus) return true;
      if (filterStatus === "done") return incident.responder_status === "done";
      if (filterStatus === "ongoing") return incident.status === "ongoing" && incident.responder_status !== "done";
      if (filterStatus === "alert") return incident.status === "alert" && incident.responder_status !== "done";
      return incident.status === filterStatus;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [incidents, searchQuery, filterStatus]
  );

  const countByStatus = incidents.reduce(
    (acc, incident) => {
      if (incident.responder_status === "done") acc.done = (acc.done || 0) + 1;
      else if (incident.status === "ongoing" && incident.responder_status !== "done") acc.ongoing = (acc.ongoing || 0) + 1;
      else if (incident.status === "alert" && incident.responder_status !== "done") acc.alert = (acc.alert || 0) + 1;
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

  const totalReports = incidents.reduce((sum, i) => sum + (i.report_count || 0), 0);

  return (
    <View style={styles.container}>
      
      {/* IMPROVED SEARCH BAR WITH SUGGESTIONS */}
      <View style={{ zIndex: 10 }}> 
        <View style={styles.searchBoxContainer}>
          <Icon name="magnify" size={24} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('search')}
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => {
              // Slight delay to allow pressing a suggestion before hiding it
              setTimeout(() => setIsSearchFocused(false), 200);
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearIcon}>
              <Icon name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        {/* FLOATING SUGGESTIONS LIST */}
        {isSearchFocused && searchSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {searchSuggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => {
                  setSearchQuery(item); // Auto-fill search
                  setIsSearchFocused(false); // Hide dropdown
                  Keyboard.dismiss(); // Hide keyboard
                }}
              >
                <Icon name="history" size={18} color="#666" style={{ marginRight: 10 }} />
                <Text style={styles.suggestionText} numberOfLines={1}>{item}</Text>
                <Icon name="arrow-top-left" size={18} color="#aaa" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={[styles.filterContainer, { zIndex: 1 }]}>
        {['alert', 'ongoing', 'done'].map((status) => (
          <TouchableOpacity
            key={status}
            style={[styles.filterButton, filterStatus === status && styles.filterButtonActive]}
            onPress={async () => {
              setFilterStatus(status);
              await fetchIncidentsWithAddresses();
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
            await fetchIncidentsWithAddresses();
          }}
        >
          <Text style={[styles.filterText, filterStatus === '' && { color: '#fff' }]}>
            All ({incidents.length})
          </Text>
        </TouchableOpacity>
      </View>

      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", zIndex: 1 }}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Animated.View style={[styles.loadingIconWrapper, { transform: [{ scale: scaleAnim }] }]}>
              <ActivityIndicator size="large" color="#007BFF" />
            </Animated.View>
            <Text style={styles.loadingMainText}>Loading Incidents</Text>
            <Text style={styles.loadingTipText}>{loadingTips[loadingTipIndex]}</Text>
            <View style={styles.loadingDotsContainer}>
              {[0, 1, 2].map((dot) => <View key={dot} style={styles.loadingDot} />)}
            </View>
          </View>
        ) : (
          <FlatList
            data={filteredIncidents}
            keyExtractor={(item, index) => index.toString()}
            keyboardShouldPersistTaps="handled" // Important for suggestions to work cleanly
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#007bff"]} tintColor="#007bff"/>
            } 
            renderItem={({ item }) => {
              const percentReports = totalReports > 0 ? ((item.report_count || 0) / totalReports * 100).toFixed(0) : 0;
              const currentStation = item.stations?.find((s) => s.station_id === stationId);
              const currentStationStatus = item.incidents_station_status[stationId]; 
              const stationStatus = currentStation?.status || "unassigned";

              return (
                <TouchableOpacity activeOpacity={0.9}>
                  <View style={styles.card}>
                    <Text style={{ fontSize: 16, marginTop: 10, marginBottom: 10 }}>
                     {t('reportedby')} {item.reporter_name || "Unknown"}
                    </Text>
                    <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                      <Text style={styles.locationText}>
                        {t('location')} {item.readable_location || item.readableAddress || item.location}
                      </Text>
                    </TouchableOpacity>
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
                        month: 'long', day: 'numeric', weekday: 'long', year: 'numeric',
                      })}
                    </Text>
                      
                    <Text>{t('reportcount')} {item.report_count || 0} ({percentReports}%)</Text>
                    <Text style={styles.clickableText} onPress={() => handleDialPhone(item.contactInfo)}>
                      {t('contact')} {item.contactInfo}
                    </Text>
                    
                    <View style={styles.mediaContainer}>
                      <Text style={styles.mediaTitle}>
                        📷 Media Evidence ({item.media?.length || 0} files)
                      </Text>
                      {item.media && item.media.length > 0 ? (
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
                        <Text style={styles.noMediaText}>No media available</Text>
                      )}
                    </View>

                    {/* Notice Boxes */}
                    {(item.status === "ongoing" || item.status === "alert") &&
                      item.responder_status !== "done" && !is_head && userRole === "responder_personnel" && (
                      <View style={styles.ongoingNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Ongoing</Text>
                        <Text style={styles.noticeText}>{t('ongoing')}</Text>
                      </View>
                    )}

                    {item.status !== "done" && item.responder_status !== "done" &&
                      stationStatus === "assigned" &&
                      (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) 
                      && (item.user_id === user_idF) && (
                      <View style={styles.ongoingNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Info</Text>
                        <Text style={styles.noticeText}>{t('ongoinginfo')}</Text>
                      </View>
                    )}

                    {item.status === "ongoing" && item.responder_status === "done" && (userRole==="responder_head" || userRole === "responder_personnel") &&(
                      <View style={styles.ongoingNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Ongoing</Text>
                        <Text style={styles.noticeText}>{t('partialdone')}</Text>
                      </View>
                    )}

                    {item.responder_status === "declined" && (userRole==="responder_head" || is_head) && (item.user_id !== user_idF) &&(
                      <View style={styles.cancelNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Declined</Text>
                        <Text style={styles.noticeText}>{t('accept')}</Text>
                      </View>
                    )}

                    {currentStationStatus === "declined" && userRole === "responder_personnel" && !is_head && (item.status !== "done")&& (
                      <View style={styles.cancelNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Declined</Text>
                        <Text style={styles.noticeText}>{t('stationdecline')}</Text>
                      </View>
                    )}

                    {item.status === "alert" && item.responder_status !== "declined" &&
                      (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) &&
                      (item.user_id !== user_idF) && item.incidents_station_status[stationId] !== "unassigned" && (
                      <TouchableOpacity>
                        <View style={styles.doneNoticeBox}>
                          <Text style={styles.noticeTitle}>Incident Alert</Text>
                          <Text style={styles.noticeText}>{t('resalert')}</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {item.status === "alert" && item.responder_status !== "declined" &&
                      (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) &&
                      (item.user_id !== user_idF) && item.incidents_station_status[stationId] === "unassigned" && (
                      <TouchableOpacity>
                        <View style={styles.UnnoticeBox}>
                          <Text style={styles.noticeTitle}>Incident Unnoticed</Text>
                          <Text style={styles.noticeText}>Incident not acknowledged / Unnotice</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {item.status === "ongoing" && item.responder_status !== "declined" && 
                      item.responder_status !== "done" && 
                      (userRole === "responder_head" || (userRole === "responder_personnel" && is_head))
                      && (item.user_id !== user_idF) && (
                      <View style={styles.ongoingNoticeBox}>
                        <Text style={styles.noticeTitle}>Incident Ongoing</Text>
                        <Text style={styles.noticeText}>{t('resdone')}</Text>
                      </View>
                    )}
                    
                    {item.status === "done" && (
                      <TouchableOpacity>
                        <View style={styles.doneNoticeBox}>
                          <Text style={styles.noticeTitle}>Incident Done</Text>
                          <Text style={styles.noticeText}>{t('done')}</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {item.status === "cancelled" &&  (
                      <TouchableOpacity>
                        <View style={styles.cancelNoticeBox}>
                          <Text style={styles.noticeTitle}>Incident Cancelled</Text>
                          <Text style={styles.noticeText}>{t('cancelled')}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    
                    {/* Buttons Container */}
                    <View style={styles.buttonContainer}>
                      {item.status !== "cancelled" && (
                        <>
                          <View style={styles.rowButtons}>
                            {item.status !== "done" && item.responder_status !== "done" && stationStatus === "assigned" && (
                              <TouchableOpacity
                                style={[styles.trackButton, styles.equalButtonSize]}
                                onPress={() => {
                                  // Auto-transition to 'ongoing' and track if it's currently an 'alert'
                                  if (item.responder_status === "alert") {
                                    toggleIncidentStatus(item.id, item.responder_status, item.location, item.station_ids);
                                  } else {
                                    navigation.navigate('TrackLocation', { 
                                      incidentId: item.id,
                                      incidentLocation: item.location,
                                      stationId: item.station_ids
                                    });
                                  }
                                }}
                              >
                                <Text style={styles.buttonText}>Track</Text>
                              </TouchableOpacity>
                            )}

                            {item.status !== "done" && item.responder_status !== "done" &&
                              stationStatus === "assigned" &&
                              (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) 
                              && (item.user_id !== user_idF) && (
                              <TouchableOpacity
                                style={[
                                  styles.statusToggle,
                                  styles.equalButtonSize,
                                  { backgroundColor: handleToggleStatus(item.responder_status).color },
                                ]}
                                onPress={() => toggleIncidentStatus(item.id, item.responder_status, item.location, item.station_ids)}
                              >
                                <Text style={styles.buttonText}>
                                  {handleToggleStatus(item.responder_status).text}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                            
                          {item.status !== "done" && item.responder_status !== "done" && (
                            <TouchableOpacity
                              style={[styles.viewRespondersButton, styles.equalButtonSize, {marginTop: 10}]}
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
        )}
        
        <ImageViewing
          images={selectedMedia.map(uri => ({ uri }))}
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
  container: { flex: 1, padding: 14 ,backgroundColor: "#fff"},
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
  
  // --- UPGRADED SEARCH STYLES ---
  searchBoxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    marginBottom: 10,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#000',
    fontSize: 16,
  },
  clearIcon: {
    padding: 4,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 52, // Right below search bar
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 999, // Ensure it floats on top of everything
    paddingVertical: 5,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  
  filterContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  filterButton: { padding: 8, borderWidth: 1, borderRadius: 5, borderColor: '#ccc' },
  filterButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  filterText: { color: '#000' },
  card: { backgroundColor: "#f9f9f9", padding: 14, borderRadius: 16, marginBottom: 18, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: {width: 0, height: 2} },
  clickableText: { color: "blue", textDecorationLine: "underline", marginVertical: 4 },
  locationText: { color: "#007BFF", textDecorationLine: 'underline', marginBottom: 4 },
  date: { color: '#666', marginTop: 4 },
  
  mediaContainer: { 
    marginVertical: 15, backgroundColor: "#fafafa", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#e8e8e8"
  },
  mediaTitle: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 12 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imageWrapper: { position: "relative", borderRadius: 8, overflow: "hidden", backgroundColor: "#e8e8e8", borderWidth: 2, borderColor: "#d0d0d0" },
  imageErrorWrapper: { borderColor: "#ff6b6b", backgroundColor: "#ffe8e8" },
  image: { width: 100, height: 100, resizeMode: "cover" }, // Resized slightly so more fit in grid
  noMediaText: { color: '#888', fontStyle: 'italic' },
  
  // Completed missing styles to prevent crashes
  imageLoadingContainer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(232, 232, 232, 0.5)'
  },
  imageErrorView: {
    width: 100, height: 100, justifyContent: 'center', alignItems: 'center'
  },
  imageIndex: {
    position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white', fontSize: 10, paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden'
  },

  // Notice Boxes
  ongoingNoticeBox: { backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#ffeeba' },
  cancelNoticeBox: { backgroundColor: '#f8d7da', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#f5c6cb' },
  doneNoticeBox: { backgroundColor: '#d4edda', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#c3e6cb' },
  UnnoticeBox: { backgroundColor: '#e2e3e5', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#d6d8db' },
  noticeTitle: { fontWeight: 'bold', marginBottom: 4, color: '#333' },
  noticeText: { color: '#555' },

  // Buttons
  buttonContainer: { marginTop: 15 },
  rowButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  equalButtonSize: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trackButton: { backgroundColor: '#17a2b8' },
  statusToggle: { backgroundColor: '#6c757d' }, // Color is overridden inline
  viewRespondersButton: { backgroundColor: '#007bff' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  // Loader & Footer
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  loadingIconWrapper: { marginBottom: 20 },
  loadingMainText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  loadingTipText: { fontSize: 14, color: '#777', marginTop: 10 },
  loadingDotsContainer: { flexDirection: 'row', marginTop: 15 },
  loadingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#007bff', marginHorizontal: 4 },
  imageFooter: { height: 50, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
  imageFooterText: { color: '#fff', fontSize: 16 }
});

export default ResponderViewList;