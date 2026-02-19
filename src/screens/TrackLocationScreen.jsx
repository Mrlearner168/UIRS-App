import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN, SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import MapboxGL from '@rnmapbox/maps';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

const { width, height } = Dimensions.get('window');

const TrackLocationScreen = ({ route, navigation }) => {
  const { incidentId, incidentLocation } = route.params;
  const [incidentCoords, setIncidentCoords] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [responderCoords, setResponderCoords] = useState(null);
  const [responderId, setResponderId] = useState(null);
  const [responderInfo, setResponderInfo] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token, setToken] = useState(null);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const { t } = useTranslation();
  
  // Animation value for bottom sheet slide up
  const slideAnim = useRef(new Animated.Value(300)).current; 

  // Fetch token once
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) setToken(storedToken);
        else navigation.navigate("Login");
      } catch (error) {
        console.log('Error fetching token:', error);
      }
    };
    fetchToken();
  }, []);

  // Parse incident location properly
  useEffect(() => {
    if (!incidentLocation) return;
    let coordsArray = typeof incidentLocation === 'string'
      ? incidentLocation.split(',').map(Number)
      : incidentLocation;

    // Check if data is in [lat, lon] format
    if (coordsArray.length === 2 && coordsArray.every(n => !isNaN(n))) {
      // Mapbox expects [longitude, latitude]
      setIncidentCoords([coordsArray[1], coordsArray[0]]);
    } else {
      console.log('Invalid incidentLocation format:', incidentLocation);
    }
  }, [incidentLocation]);

  // Fetch responders
  const fetchAcceptedResponders = async () => {
    if (!incidentCoords || !token) return;
    try {
      const res = await fetch(`${SERVER_URL}/incident/${incidentId}/accepted_responders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.stations && data.stations.length > 0) {
        // Filter: Only include stations that have responders with valid location data
        const validStations = data.stations.filter(st => 
          st.responders && 
          st.responders.length > 0 && 
          st.responders.some(r => r.latitude && r.longitude)
        );

        setStations(validStations);

        if (validStations.length === 0) {
            setResponderCoords(null);
            setResponderId(null);
            setResponderInfo(null);
            return;
        }

        // Intelligent selection: Keep current if valid, else pick first available
        const stationExists = selectedStation && validStations.find(s => s.station_name === selectedStation);
        const stationToUse = stationExists ? selectedStation : validStations[0].station_name;
        
        if (selectedStation !== stationToUse) {
            setSelectedStation(stationToUse);
        }

        const selectedData = validStations.find(s => s.station_name === stationToUse);
        const validResponders = (selectedData?.responders || []).filter(
          r => r.latitude && r.longitude
        );

        if (!validResponders.length) {
          setResponderCoords(null);
          setResponderId(null);
          setResponderInfo(null);
          return;
        }

        // Find nearest responder in this station
        let nearestResponder = validResponders[0];
        let minDistance = getDistance(incidentCoords, [nearestResponder.longitude, nearestResponder.latitude]);

        for (const r of validResponders) {
          const coord = [r.longitude, r.latitude];
          const dist = getDistance(incidentCoords, coord);
          if (dist < minDistance) {
            minDistance = dist;
            nearestResponder = r;
          }
        }

        setResponderCoords([nearestResponder.longitude, nearestResponder.latitude]);
        setResponderId(nearestResponder.id);
        setResponderInfo({
          firstName: nearestResponder.firstName,
          lastName: nearestResponder.lastName,
          status: nearestResponder.status,
          role: nearestResponder.role,
          station_name: selectedData?.station_name || "Unknown"
        });
      } else {
        setStations([]);
        setResponderCoords(null);
        setResponderId(null);
        setResponderInfo(null);
      }
    } catch (e) {
      console.log("Failed to fetch responders:", e);
    }
  };

  function getDistance(coord1, coord2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Fetch route from Mapbox
  const fetchRouteWithDuration = async (origin, destination) => {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${RNMAPBOX_MAPS_DOWNLOAD_TOKEN}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.routes && json.routes.length > 0) {
        return {
          coords: json.routes[0].geometry.coordinates,
          duration: json.routes[0].duration
        };
      }
    } catch (e) {
      console.log("Error fetching route:", e);
    }
    return null;
  };

  // Poll for responder updates
  useEffect(() => {
    fetchAcceptedResponders();
    const intervalId = setInterval(fetchAcceptedResponders, 10000);
    return () => clearInterval(intervalId);
  }, [incidentCoords, token, selectedStation]);

  // Update route when coords change
  useEffect(() => {
    const updateRoute = async () => {
      if (!responderCoords || !incidentCoords) return;
      const routeResult = await fetchRouteWithDuration(responderCoords, incidentCoords);
      if (routeResult) {
        setRouteCoords(routeResult.coords);
        setRouteDuration(routeResult.duration);
      } else {
        setRouteCoords([responderCoords, incidentCoords]);
        setRouteDuration(null);
      }
    };
    updateRoute();
  }, [responderCoords, incidentCoords]);

  // Animate bottom sheet on load
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true
    }).start();
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const handleNavigate = () => {
    if (!incidentCoords) return;
    const [lng, lat] = incidentCoords;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lng}`;
    const label = 'Incident Location';
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    
    // Fallback to Google Maps web URL if native app schemes fail
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    
    Linking.canOpenURL(url).then(supported => {
        if (supported) {
            return Linking.openURL(url);
        } else {
            return Linking.openURL(googleMapsUrl);
        }
    }).catch(() => {
        Linking.openURL(googleMapsUrl);
    });
  };

  return (
    <View style={styles.container}>
      {/* Header Overlay */}
      <View style={styles.headerOverlay}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('track') || "Track Responder"}</Text>
        </View>
        <TouchableOpacity onPress={handleNavigate} style={[styles.backButton, styles.navigateButton]}>
            <Icon name="navigation-variant" size={24} color="#007BFF" />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <MapboxGL.MapView
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
      >
        <MapboxGL.Camera
          zoomLevel={13}
          centerCoordinate={incidentCoords ?? [0, 0]}
          animationMode="flyTo"
          animationDuration={2000}
        />

        <MapboxGL.UserLocation visible={true} />

        {/* Route Line */}
        {mapLoaded && routeCoords && routeCoords.length > 1 && (
          <MapboxGL.ShapeSource
            id="routeSource"
            shape={{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: routeCoords }
            }}
          >
            <MapboxGL.LineLayer
              id="routeLine"
              style={{
                lineColor: '#007BFF',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.8
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Incident Marker with Label */}
        {mapLoaded && incidentCoords && (
          <MapboxGL.PointAnnotation id="incident-marker" coordinate={incidentCoords}>
            <View style={{ alignItems: 'center' }}>
                <View style={styles.mapLabelContainer}>
                    <Text style={styles.mapLabelText}>{t('incident') || "Incident"}</Text>
                </View>
                <View style={styles.markerContainer}>
                  <View style={[styles.markerIcon, { backgroundColor: '#EF4444' }]}>
                    <Icon name="alert-circle" size={20} color="#fff" />
                  </View>
                  <View style={styles.markerArrow} />
                </View>
            </View>
          </MapboxGL.PointAnnotation>
        )}

        {/* Responder Marker with Label */}
        {mapLoaded && responderCoords && (
          <MapboxGL.PointAnnotation id="responder-marker" coordinate={responderCoords}>
            <View style={{ alignItems: 'center' }}>
                <View style={styles.mapLabelContainer}>
                    <Text style={styles.mapLabelText}>
                        {responderInfo ? responderInfo.firstName : (t('responder') || "Responder")}
                    </Text>
                </View>
                <View style={styles.markerContainer}>
                  <View style={[styles.markerIcon, { backgroundColor: '#10B981' }]}>
                    <Icon name="ambulance" size={20} color="#fff" />
                  </View>
                  <View style={[styles.markerArrow, { borderTopColor: '#10B981' }]} />
                </View>
            </View>
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* Bottom Info Sheet */}
      <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.dragHandle} />
        
        <View style={styles.infoHeader}>
          <Text style={styles.infoTitle}>{t('resinfo') || "Responder Details"}</Text>
          {routeDuration && (
            <View style={styles.etaBadge}>
              <Icon name="clock-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.etaText}>{formatDuration(routeDuration)}</Text>
            </View>
          )}
        </View>

        {/* Station Picker */}
        {stations.length > 0 ? (
          <View style={styles.pickerContainer}>
            <Icon name="office-building-marker" size={20} color="#666" style={styles.pickerIcon} />
            <Picker
              selectedValue={selectedStation}
              onValueChange={(value) => setSelectedStation(value)}
              style={styles.picker}
              dropdownIconColor="#333"
            >
              {stations.map((station) => (
                <Picker.Item
                  key={station.station_id}
                  label={station.station_name}
                  value={station.station_name}
                  style={styles.pickerItem}
                />
              ))}
            </Picker>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('nostationres') || "No responders active"}</Text>
          </View>
        )}

        {/* Responder Details */}
        {responderInfo ? (
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {responderInfo.firstName?.[0]}{responderInfo.lastName?.[0]}
                </Text>
              </View>
              <View style={styles.textColumn}>
                <Text style={styles.responderName}>
                  {responderInfo.firstName} {responderInfo.lastName}
                </Text>
                <Text style={styles.responderRole}>{responderInfo.role}</Text>
              </View>
              <View style={[styles.statusTag, { backgroundColor: '#D1FAE5' }]}>
                <Text style={[styles.statusText, { color: '#065F46' }]}>
                  {responderInfo.status || 'Active'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          stations.length > 0 && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#007BFF" />
              <Text style={styles.loadingText}>{t('searching') || "Locating nearest responder..."}</Text>
            </View>
          )
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { flex: 1 },
  
  // Header Overlay
  headerOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  navigateButton: {
    backgroundColor: '#fff', // Keep consistent background
  },
  headerTitle: {
    marginLeft: 15,
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Map Labels
  mapLabelContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  mapLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },

  // Markers
  markerContainer: { alignItems: 'center' },
  markerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#EF4444', // Matches incident color default
    marginTop: -2,
  },

  // Bottom Sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -5 },
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 15,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  infoTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007BFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  etaText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Picker
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  pickerIcon: { marginLeft: 12 },
  picker: { flex: 1, height: 50 },
  pickerItem: { fontSize: 14, color: '#333' },

  // Responder Details
  detailsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  textColumn: { flex: 1 },
  responderName: { fontSize: 16, fontWeight: '700', color: '#111' },
  responderRole: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statusTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },

  // Empty/Loading States
  emptyState: { alignItems: 'center', padding: 20 },
  emptyText: { color: '#9CA3AF', fontSize: 14 },
  loadingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingText: { marginLeft: 10, color: '#6B7280', fontSize: 14 },
});

export default TrackLocationScreen;