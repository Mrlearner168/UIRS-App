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
  const [isSearchFocused, setIsSearchFocused] = useState(false); 
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

  const toggleIncidentStatus = async (
    incidentId,
    currentStatus,
    incidentLocation,
    stationIds
  ) => {
    try {
      const token = await EncryptedStorage.getItem("token");
    
      const nextStatus =
        currentStatus === "alert" || currentStatus === "pending" || currentStatus === "unassigned"
          ? "ongoing"
          : currentStatus === "ongoing"
          ? "done"
          : null;
    
      if (!nextStatus) return;
    
      const response = await axios.put(
        `${SERVER_URL}/update_incident_status/${incidentId}`,
        {
          status: nextStatus,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    
      const incidentStatus = response.data.incident_status ?? nextStatus;
    
      setIncidents(prev =>
        prev.map(item => {
          if (item.id !== incidentId) return item;
        
          let responderDetails = [...(item.responder_details || [])];
        
          const index = responderDetails.findIndex(
            r => r.responder_id === user_idF
          );
        
          if (index >= 0) {
            responderDetails[index] = {
              ...responderDetails[index],
              status: incidentStatus,
            };
          } else {
            responderDetails.push({
              responder_id: user_idF,
              status: incidentStatus,
            });
          }
        
          return {
            ...item,
            status: incidentStatus,
            responder_details: responderDetails,
          };
        })
      );
    
      setFilterStatus(nextStatus);
    
      if (nextStatus === "ongoing" && incidentLocation) {
        navigation.navigate("TrackLocation", {
          incidentId,
          incidentLocation,
          stationId: stationIds,
        });
      }
    
      if (nextStatus === "done") {
        Alert.alert(
          "Response Complete",
          "Your responder status is set to DONE. Note that the incident remains active until all other responders complete their task."
        );
        fetchIncidentsWithAddresses();
      }
    } catch (error) {
      console.log(error.response?.data || error);
      Alert.alert(
        "Update Failed",
        error.response?.data?.error || "Unable to update status."
      );
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
      alert: { color: "red", text: "Start Responding" },
      pending: { color: "red", text: "Start Responding" },
      unassigned: { color: "red", text: "Start Responding" },
      ongoing: { color: "#28a745", text: "Mark My Task Done" },
      done: { color: "green", text: "Done" },
      cancelled: { color: "red", text: "Alert" },
    };
    return statusMap[status] || { color: "gray", text: "Unknown" };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return '#28a745';
      case 'ongoing': return '#fd7e14';
      case 'alert':
      case 'pending':
      case 'unassigned': return '#dc3545';
      case 'declined':
      case 'cancelled': return '#6c757d';
      default: return '#007bff';
    }
  };

  const getSeverityColor = (severity) => {
    switch (String(severity).toLowerCase()) {
      case '5':
      case 'critical':
      case 'extreme': return '#8B0000'; 
      case '4':
      case 'severe':
      case 'major': return '#DC3545';
      case '3':
      case 'high':
      case 'moderate': return '#FD7E14';
      case '2':
      case 'medium':
      case 'minor': return '#FFC107'; 
      case '1':
      case 'low': return '#28A745'; 
      default: return '#6C757D'; 
    }
  };

  const getSeverityLabel = (severity) => {
    const severityMap = {
      1: "Low",
      2: "Moderate",
      3: "High",
      4: "Critical",
      5: "Extreme",
    };
    return severityMap[severity] || "Unknown";
  };

  const searchSuggestions = useMemo(() => {
    if (!searchQuery || !isSearchFocused) return [];
    
    const query = searchQuery.toLowerCase();
    const matches = new Set();

    incidents.forEach(incident => {
      const type = incident.incidentType || "";
      const subType = incident.subType || "";
      const location = incident.readable_location || incident.readableAddress || incident.location || "";
      const reporter = incident.reporter_name || "";

      if (type.toLowerCase().includes(query)) matches.add(type);
      if (subType.toLowerCase().includes(query) && subType !== 'N/A') matches.add(subType);
      if (reporter.toLowerCase().includes(query)) matches.add(reporter);
      if (location.toLowerCase().includes(query)) matches.add(location);
    });

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
      
      const myDetails = incident.responder_details?.find(r => r.responder_id === user_idF);
      const myResponderStatus = myDetails ? myDetails.status : incident.responder_status;

      if (filterStatus === "done") return myResponderStatus === "done";
      if (filterStatus === "ongoing") return myResponderStatus === "ongoing";
      
      if (filterStatus === "alert") {
        return ["alert", "pending", "incoming", "unassigned"].includes(myResponderStatus);
      }
      
      return false;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [incidents, searchQuery, filterStatus, user_idF]
  );

  const countByStatus = incidents.reduce(
    (acc, incident) => {
      const myDetails = incident.responder_details?.find(r => r.responder_id === user_idF);
      const myResponderStatus = myDetails ? myDetails.status : incident.responder_status;

      if (myResponderStatus === "done") {
        acc.done = (acc.done || 0) + 1;
      } else if (myResponderStatus === "ongoing") {
        acc.ongoing = (acc.ongoing || 0) + 1;
      } else if (["alert", "pending", "incoming", "unassigned"].includes(myResponderStatus)) {
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

  const totalReports = incidents.reduce((sum, i) => sum + (i.report_count || 0), 0);
  
  return (
    <View style={styles.container}>
      
      {/* Search Header */}
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
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={styles.clearIcon}>
              <Icon name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        {isSearchFocused && searchSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {searchSuggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionItem}
                onPress={() => {
                  setSearchQuery(item); 
                  setIsSearchFocused(false); 
                  Keyboard.dismiss(); 
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

      {/* Filter Tabs */}
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
            keyboardShouldPersistTaps="handled" 
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#007bff"]} tintColor="#007bff"/>
            } 
            renderItem={({ item }) => {
              const percentReports = totalReports > 0 ? ((item.report_count || 0) / totalReports * 100).toFixed(0) : 0;
              const currentStation = item.stations?.find((s) => s.station_id === stationId);
              const stationStatus = currentStation?.status || "unassigned";

              const myDetails = item.responder_details?.find(r => r.responder_id === user_idF);
              const myResponderStatus = myDetails ? myDetails.status : (item.responder_status || "alert");

              const role = userRole?.toLowerCase();
              console.log("User Role:", role, "Is Head:", is_head, "My Responder Status:", myResponderStatus, "Station Status:", stationStatus);
              const hasManagementAccess =
                role === "responder_head" ||
                (role === "responder_personnel" && is_head);

              const isResponderPersonnel =
                role === "responder_personnel" && !is_head;

              const incidentCancelled = item.status === "cancelled";
              const incidentDone = item.status === "done";
              const incidentFinished = incidentCancelled || incidentDone;

              const responderDone = myResponderStatus === "done";
              const responderDeclined = myResponderStatus === "declined";
              const responderFinished = responderDone || responderDeclined;

              return (
                <TouchableOpacity activeOpacity={0.9}>
                  <View style={[styles.card, { borderLeftColor: getSeverityColor(item.severity_level || item.severity) }]}>

                    {/* DUAL STATUS BADGES HEADER */}
                    <View style={styles.statusHeaderRow}>
                      
                      {/* 1. MY RESPONDER STATUS */}
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(myResponderStatus) }]}>
                        <Icon 
                          name={myResponderStatus === 'done' ? "account-check" : myResponderStatus === 'ongoing' ? "car-emergency" : "bell-ring"} 
                          size={16} 
                          color="#fff" 
                        />
                        <View style={styles.badgeTextWrapper}>
                          <Text style={styles.badgeSubtitle}>MY STATUS</Text>
                          <Text style={styles.badgeMainTitle}>{(myResponderStatus || "unassigned").toUpperCase()}</Text>
                        </View>
                      </View>

                      {/* 2. OVERALL INCIDENT STATUS */}
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                        <Icon 
                          name={item.status === 'done' ? "check-circle" : item.status === 'ongoing' ? "progress-clock" : "alert-rhombus"} 
                          size={16} 
                          color="#fff" 
                        />
                        <View style={styles.badgeTextWrapper}>
                          <Text style={styles.badgeSubtitle}>OVERALL INCIDENT</Text>
                          <Text style={styles.badgeMainTitle}>{(item.status || "unknown").toUpperCase()}</Text>
                        </View>
                      </View>

                    </View>

                    {/* Incident Details Section */}
                    <Text style={{ fontSize: 16, marginTop: 12, marginBottom: 6, fontWeight: 'bold' }}>
                      {t('reportedby')} {item.reporter_name || "Unknown"}
                    </Text>
                    
                    <TouchableOpacity onPress={() => openGoogleMaps(item.location)}>
                      <Text style={styles.locationText}>
                        <Icon name="map-marker-radius" size={16} /> {t('location')} {item.readable_location || item.readableAddress || item.location}
                      </Text>
                    </TouchableOpacity>
                    <Text>
                      Severity: {getSeverityLabel(item.severity_level || item.severity)}
                    </Text>
                    <Text style={styles.infoLine}><Text style={styles.boldText}>{t('incidenttype')}</Text> {item.incidentType}</Text>
                    {item.incidentType !== "Others" && (
                      <Text style={styles.infoLine}><Text style={styles.boldText}>{t('subtype')}</Text> {item.subType || "N/A"}</Text>
                    )}
                    {item.incidentType === "Others" && (
                      <Text style={styles.infoLine}><Text style={styles.boldText}>{t('description')}</Text> {item.incidentDescription}</Text>
                    )}
                    <Text style={styles.infoLine}><Text style={styles.boldText}>{t('time')}</Text> {item.incidentTime}</Text>
                    <Text style={styles.date}>
                      {t('datereported')}{' '}
                      {new Date(item.created_at).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', weekday: 'long', year: 'numeric',
                      })}
                    </Text>
                      
                    <Text style={styles.infoLine}><Text style={styles.boldText}>{t('reportcount')}</Text> {item.report_count || 0} ({percentReports}%)</Text>
                    <Text style={styles.clickableText} onPress={() => handleDialPhone(item.contactInfo)}>
                      <Icon name="phone" size={14} /> {t('contact')} {item.contactInfo}
                    </Text>
                    
                    {/* Media Evidence */}
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
                        <Text style={styles.noMediaText}>No media available</Text>
                      )}
                    </View>

                    {/* Permission Helpers */}
                    {(() => {
                      const role = userRole?.toLowerCase();
                    
                      const hasManagementAccess =
                        role === "responder_head" ||
                        (role === "responder_personnel" && is_head);
                    
                      const isResponderPersonnel =
                        role === "responder_personnel" && !is_head;
                    
                      return (
                        <>
                          {/* ================= ROLE INFORMATION ================= */}
                          <View
                            style={{
                              backgroundColor: hasManagementAccess ? "#e8f4fd" : "#fff8e1",
                              borderWidth: 1,
                              borderLeftWidth: 4,
                              borderColor: hasManagementAccess ? "#b8daff" : "#ffe082",
                              borderLeftColor: hasManagementAccess ? "#004085" : "#ff8f00",
                              padding: 12,
                              borderRadius: 8,
                              marginBottom: 12,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                marginBottom: 4,
                              }}
                            >
                              <Icon
                                name={hasManagementAccess ? "shield-account" : "account-hard-hat"}
                                size={20}
                                color={hasManagementAccess ? "#004085" : "#ff8f00"}
                              />

                              <Text
                                style={{
                                  fontSize: 16,
                                  fontWeight: "bold",
                                  color: hasManagementAccess ? "#004085" : "#ff8f00",
                                  marginLeft: 8,
                                }}
                              >
                                {role === "responder_head"
                                  ? "Role: Responder Head"
                                  : is_head
                                  ? "Role: Team Leader"
                                  : "Role: Responder Personnel"}
                              </Text>
                            </View>
                                
                            <Text
                              style={{
                                fontSize: 13,
                                color: hasManagementAccess ? "#004085" : "#8a6d3b",
                                lineHeight: 18,
                              }}
                            >
                              {hasManagementAccess
                                ? "You have full incident management privileges. You can update deployment status, manage responders, monitor deployment, track responder locations, and complete incident operations."
                                : "You are assigned to assist this incident. You can track locations and support the Team Leader or Responder Head. Incident management actions are restricted."}
                            </Text>
                          </View>
                              
                          {/* ================= INCIDENT STATUS NOTICE ================= */}
                          {(() => {
                            const isHeadActor = hasManagementAccess;
                            const isStationUnassigned =
                              item.incidents_station_status?.[stationId] === "unassigned";
                          
                            if (item.status === "cancelled") {
                              return (
                                <View style={styles.cancelNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon name="cancel" size={20} color="#721c24" />
                                    <Text style={[styles.noticeTitle, { color: "#721c24" }]}>
                                      Incident Cancelled
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    This incident has been cancelled by dispatch. No further action
                                    is required.
                                  </Text>
                                </View>
                              );
                            }
                          
                            if (
                              myResponderStatus === "declined" ||
                              stationStatus === "declined"
                            ) {
                              return (
                                <View style={styles.cancelNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon
                                      name="close-circle-outline"
                                      size={20}
                                      color="#721c24"
                                    />
                                    <Text style={[styles.noticeTitle, { color: "#721c24" }]}>
                                      Incident Declined
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    {!isHeadActor && stationStatus === "declined"
                                      ? "Your station declined this dispatch."
                                      : "You or your station declined this dispatch."}
                                  </Text>
                                </View>
                              );
                            }
                          
                            if (item.status === "done") {
                              return (
                                <View style={styles.doneNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon name="check-all" size={20} color="#155724" />
                                    <Text style={[styles.noticeTitle, { color: "#155724" }]}>
                                      Incident Completed
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    All assigned responders have completed their operations. This
                                    incident has been officially closed.
                                  </Text>
                                </View>
                              );
                            }
                          
                            if (
                              myResponderStatus === "done" &&
                              item.status !== "done"
                            ) {
                              return (
                                <View style={styles.partialDoneNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon
                                      name="account-check-outline"
                                      size={20}
                                      color="#0c5460"
                                    />
                                    <Text style={[styles.noticeTitle, { color: "#0c5460" }]}>
                                      Your Deployment is Complete
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    {isHeadActor
                                      ? "Your deployment is complete. The incident remains active until all assigned responders finish their operations."
                                      : "You have completed your assigned task. Please remain available if additional assistance is requested."}
                                  </Text>
                                </View>
                              );
                            }
                          
                            if (
                              item.status === "alert" ||
                              ["alert", "pending", "unassigned"].includes(myResponderStatus)
                            ) {
                              if (isHeadActor && isStationUnassigned) {
                                return (
                                  <View style={styles.UnnoticeBox}>
                                    <View style={styles.noticeHeader}>
                                      <Icon
                                        name="bell-off-outline"
                                        size={20}
                                        color="#856404"
                                      />
                                      <Text style={styles.UnnoticeTitle}>
                                        Awaiting Station Acknowledgement
                                      </Text>
                                    </View>
                                
                                    <Text style={styles.UnnoticeText}>
                                      Your station has not yet acknowledged this incident. Review
                                      the dispatch and begin response when ready.
                                    </Text>
                                  </View>
                                );
                              }
                            
                              return (
                                <View style={styles.alertNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon
                                      name="bell-ring-outline"
                                      size={20}
                                      color="#721c24"
                                    />
                                    <Text style={[styles.noticeTitle, { color: "#721c24" }]}>
                                      New Incident Assignment
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    {isHeadActor
                                      ? 'You have been assigned to manage this incident. Select "Start Responding" to begin operations or "Track Location" to navigate to the scene.'
                                      : 'You have been assigned to assist this incident. Select "Track Location" to navigate to the incident scene and await further instructions.'}
                                  </Text>
                                </View>
                              );
                            }
                          
                            if (
                              item.status === "ongoing" ||
                              myResponderStatus === "ongoing"
                            ) {
                              return (
                                <View style={styles.ongoingNoticeBox}>
                                  <View style={styles.noticeHeader}>
                                    <Icon
                                      name="car-emergency"
                                      size={20}
                                      color="#856404"
                                    />
                                    <Text style={[styles.noticeTitle, { color: "#856404" }]}>
                                      Active Deployment
                                    </Text>
                                  </View>
                              
                                  <Text style={styles.noticeText}>
                                    {isHeadActor
                                      ? "Incident response is currently active. Coordinate responders, monitor progress, and mark the deployment as completed once operations have concluded."
                                      : "You are actively deployed to this incident. Follow the instructions of your Team Leader or Responder Head and continue assisting until your assignment is complete."}
                                  </Text>
                                </View>
                              );
                            }
                          
                            return null;
                          })()}
                        </>
                      );
                    })()}
                    {/* Action Buttons */}
                    <View style={styles.buttonContainer}>
                      {!incidentFinished && (
                        <>
                          <View style={styles.rowButtons}>
                            {/* Track Location */}
                            {!responderFinished && (
                              <TouchableOpacity
                                style={[styles.trackButton, styles.equalButtonSize]}
                                onPress={() =>
                                  navigation.navigate("TrackLocation", {
                                    incidentId: item.id,
                                    incidentLocation: item.location,
                                    stationId: item.station_ids,
                                  })
                                }
                              >
                                <Text style={styles.buttonText}>
                                  {hasManagementAccess
                                    ? "Manage / Track Location"
                                    : "Track Location"}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Start / Done Button (Management Only) */}
                            {!responderFinished &&
                              hasManagementAccess && (
                                <TouchableOpacity
                                  style={[
                                    styles.statusToggle,
                                    styles.equalButtonSize,
                                    {
                                      backgroundColor:
                                        handleToggleStatus(myResponderStatus).color,
                                    },
                                  ]}
                                  onPress={() =>
                                    toggleIncidentStatus(
                                      item.id,
                                      myResponderStatus,
                                      item.location,
                                      item.station_ids
                                    )
                                  }
                                >
                                  <Text style={styles.buttonText}>
                                    {handleToggleStatus(myResponderStatus).text}
                                  </Text>
                                </TouchableOpacity>
                              )}
                          </View>
                            
                          {/* View Responders */}
                          {!responderFinished &&
                            item.status !== "done" &&
                            hasManagementAccess && (
                              <TouchableOpacity
                                style={[
                                  styles.viewRespondersButton,
                                  styles.equalButtonSize,
                                  { marginTop: 10 },
                                ]}
                                onPress={() => handleViewResponders(item.id)}
                              >
                                <Text style={styles.buttonText}>
                                  {t("reslist") || "View Responders"}
                                </Text>
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
  container: { flex: 1, padding: 14, backgroundColor: "#fff" },
  heading: { fontSize: 20, fontWeight: "bold", marginBottom: 10, textAlign: "center" },
  
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
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: '100%', color: '#000', fontSize: 16 },
  clearIcon: { padding: 4 },
  suggestionsContainer: {
    position: 'absolute',
    top: 52, 
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 999, 
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
  suggestionText: { flex: 1, fontSize: 15, color: '#333' },
  
  filterContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  filterButton: { padding: 8, borderWidth: 1, borderRadius: 5, borderColor: '#ccc' },
  filterButtonActive: { backgroundColor: '#007bff', borderColor: '#007bff' },
  filterText: { color: '#000' },
  
  card: { 
    backgroundColor: "#f9f9f9", 
    padding: 14, 
    borderRadius: 16, 
    marginBottom: 18, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 3, 
    shadowOffset: { width: 0, height: 2 } ,
    borderLeftWidth: 6,
    borderLeftColor: '#ccc',
  },
  
  // Dual Status Badges
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  statusBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 6,
  },
  badgeTextWrapper: {
    flexDirection: 'column',
  },
  badgeSubtitle: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '700',
    opacity: 0.85,
    letterSpacing: 0.3,
  },
  badgeMainTitle: {
    fontSize: 11,
    color: '#fff',
    fontWeight: 'bold',
  },

  infoLine: { fontSize: 14, marginVertical: 1, color: '#333' },
  boldText: { fontWeight: '600' },
  clickableText: { color: "blue", textDecorationLine: "underline", marginVertical: 4 },
  locationText: { color: "#007BFF", textDecorationLine: 'underline', marginVertical: 4, fontWeight: '500' },
  date: { color: '#666', marginTop: 2, fontSize: 12 },
  
  mediaContainer: { 
    marginVertical: 12, backgroundColor: "#fafafa", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#e8e8e8"
  },
  mediaTitle: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 10 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imageWrapper: { position: "relative", borderRadius: 8, overflow: "hidden", backgroundColor: "#e8e8e8", borderWidth: 2, borderColor: "#d0d0d0" },
  imageErrorWrapper: { borderColor: "#ff6b6b", backgroundColor: "#ffe8e8" },
  image: { width: 90, height: 90, resizeMode: "cover" }, 
  noMediaText: { color: '#888', fontStyle: 'italic', fontSize: 12 },
  
  imageLoadingContainer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(232, 232, 232, 0.5)'
  },
  imageErrorView: {
    width: 90, height: 90, justifyContent: 'center', alignItems: 'center'
  },
  imageIndex: {
    position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white', fontSize: 10, paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden'
  },

  // Responder-Focused Notice Boxes
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  alertNoticeBox: { backgroundColor: '#f8d7da', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#f5c6cb' },
  ongoingNoticeBox: { backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#ffeeba' },
  partialDoneNoticeBox: { backgroundColor: '#d1ecf1', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#bee5eb' },
  cancelNoticeBox: { backgroundColor: '#e2e3e5', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#d6d8db' },
  doneNoticeBox: { backgroundColor: '#d4edda', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#c3e6cb' },
  unnoticeBox: { backgroundColor: '#ffeeba', padding: 12, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#ffdf7e' },
  unnoticeTitle: { fontWeight: 'bold', fontSize: 13, color: '#856404' },
  unnoticeText: { color: '#856404', fontSize: 13, lineHeight: 18 },
  noticeTitle: { fontWeight: 'bold', fontSize: 13 },
  noticeText: { color: '#444', fontSize: 13, lineHeight: 18 },

  buttonContainer: { marginTop: 12 },
  rowButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  equalButtonSize: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trackButton: { backgroundColor: '#17a2b8' },
  statusToggle: { backgroundColor: '#6c757d' }, 
  viewRespondersButton: { backgroundColor: '#007bff' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

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