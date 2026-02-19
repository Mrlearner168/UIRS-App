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
//import { useGlobalIncidentListener } from '../hook/useGlobalIncidentListener';

const ResponderViewList = () => {
  const [incidents, setIncidents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [resModalVisible, setResModalVisible] = useState(false);
 //const [isModalVisible, setModalVisible] = useState(false);
  const [stationId, setStationId] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [filterStatus, setFilterStatus] = useState("alert");
  const [userRole, setUserRole] = useState("");
  const [respondersList, setRespondersList] = useState([]);
  const [incidentId, setIncidentId] = useState(null);
  const [is_head, setIsHead] = useState(false);
  const [user_idF , setUser_id] = useState(null);
  const [imageLoadingState, setImageLoadingState] = useState({});
  const [fullImageViewerVisible, setFullImageViewerVisible] = useState(false);
  const [loadingTipIndex, setLoadingTipIndex] = useState(0);
  const { t,} = useTranslation();
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

  //useGlobalIncidentListener(stationId, (incident) => {
    //setIncidents(prev => [incident, ...prev]);
  //});
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
      setLoading(false);
    }
  }, [isOnline]);
  
  // Hook for auto-fetch when screen focused and verify token
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
          await fetchIncidentsWithAddresses();
        } catch (error) {
          console.error('Token verification failed:', error);
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      };
      verifyTokenAndFetch();
    }, [fetchIncidentsWithAddresses, navigation])
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

  //const openImageModal = (mediaArray, index) => {
  //  setSelectedMedia(mediaArray);
  //  setCurrentImageIndex(index);
  //  setModalVisible(true);
  //};
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
      deleted: { color: "green", text: "Deleted" },
      cancelled: { color: "red", text: "Alert" },
    };
    return statusMap[status] || { color: "gray", text: "Unknown" };
  };

  // Memoize filtered incidents to prevent unnecessary map operations
  const filteredIncidents = useMemo(() => 
    incidents
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
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [incidents, searchQuery, filterStatus]
  );


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
 // console.log("filtered incidents:", JSON.stringify(filteredIncidents, null , 2));
  
  //console.log("stationId:", stationId);
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

          return (
            <TouchableOpacity>
              <View style={styles.card}>
                <Text style={{ fontSize: 16, marginTop: 10, marginBottom: 10 }}>
                 {t('reportedby')} {item.reporter_name || "Unknown"}
                </Text>
                <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                  <Text style={styles.locationText}>
                    {t('location')} {item.readable_location || item.readableLocation || item.location}
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
                      {t('ongoinginfo')}
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
                {item.status === "alert" &&
                item.responder_status !== "declined" &&
                (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) &&
                (item.user_id !== user_idF) &&
                // check if your station exists and is unassigned
                item.incidents_station_status[stationId] !== "unassigned" && (
                  <TouchableOpacity>
                    <View style={styles.doneNoticeBox}>
                      <Text style={styles.doneNoticeTitle}>Incident Alert</Text>
                      <Text style={styles.ongoingNoticeText}>
                        {t('resalert')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {item.status === "alert" &&
                item.responder_status !== "declined" &&
                (userRole === "responder_head" || (userRole === "responder_personnel" && is_head)) &&
                (item.user_id !== user_idF) &&
                 // check if your station exists and is unassigned
                item.incidents_station_status[stationId] === "unassigned" && (
                  <TouchableOpacity>
                    <View style={styles.UnnoticeBox}>
                      <Text style={styles.UnnoticeTitle}>Incident Unnoticed</Text>
                      <Text style={styles.UnnoticeText}>
                        Incident not acknowledged / Unnotice
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
                            onPress={() => navigation.navigate('TrackLocation', { 
                            incidentId: item.id,
                            incidentLocation: item.location,
                            stationId: item.station_ids
                            })}
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
  container: { flex: 1, padding: 14 ,backgroundColor: "#fff",},
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
  searchInput: { height: 40, borderColor: 'gray', borderWidth: 1, marginBottom: 10, paddingHorizontal: 10, backgroundColor: "#f0f0f0", borderRadius: 5, color: "#000" },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  filterButton: { padding: 8, borderWidth: 1, borderRadius: 5, borderColor: '#ccc' },
  filterButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  filterText: { color: '#000' },
  card: { backgroundColor: "#f9f9f9", padding: 14, borderRadius: 16, marginBottom: 18 },
  clickableText: { color: "blue", textDecorationLine: "underline" },
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
    marginBottom: 12
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
UnnoticeBox: {
  backgroundColor: '#FFF4E5',
  borderLeftWidth: 5,
  borderLeftColor: 'rgb(153, 133, 133)',
  padding: 10,
  borderRadius: 8,
  marginTop: 8,
},
UnnoticeText: {
  fontSize: 14,
  color: '#555',
  lineHeight: 20,
},  

UnnoticeTitle: {
  fontSize: 16,
  fontWeight: 'bold',
  color: 'rgb(115, 101, 101)',
  marginBottom: 4,
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

export default ResponderViewList;
