import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN, SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import MapboxGL from '@rnmapbox/maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

const { width } = Dimensions.get('window');

// Utility: Haversine distance in meters
const getDistance = (coord1, coord2) => {
  if (!coord1 || !coord2) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const TrackLocationScreen = ({ route, navigation }) => {
  const { incidentId, incidentLocation } = route.params;
  const [incidentCoords, setIncidentCoords] = useState(null);
  const [responderCoords, setResponderCoords] = useState(null);
  const [responderInfo, setResponderInfo] = useState(null);
  
  const [routeData, setRouteData] = useState({ coords: null, duration: null, distance: null, steps: [] });
  const lastRoutedCoords = useRef(null); 
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [token, setToken] = useState(null);
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [mapStyle, setMapStyle] = useState('street');
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationHeading, setNavigationHeading] = useState(0);
  const [navigationPitch, setNavigationPitch] = useState(0);
  const { t } = useTranslation();
  
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) setToken(storedToken);
        else navigation.navigate("Login");
      } catch (error) {
        console.error('Error fetching token:', error);
      }
    };
    fetchToken();
  }, [navigation]);

  useEffect(() => {
    if (!incidentLocation) return;
    try {
      const coordsArray = typeof incidentLocation === 'string'
        ? incidentLocation.split(',').map(Number)
        : incidentLocation;

      if (coordsArray.length === 2 && coordsArray.every((n) => !isNaN(n))) {
        setIncidentCoords([coordsArray[1], coordsArray[0]]);
      } else {
        console.warn('Invalid incidentLocation format:', incidentLocation);
      }
    } catch (e) {
      console.error('Error parsing incident coordinates:', e);
    }
  }, [incidentLocation]);

  const fetchAcceptedResponders = useCallback(async (isMounted) => {
    if (!incidentCoords || !token) return;
    try {
      // 1. ADD A CACHE-BUSTER TIMESTAMP
      const timestamp = new Date().getTime(); 
      const res = await fetch(`${SERVER_URL}/incident/${incidentId}/accepted_responders?t=${timestamp}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      if (!res.ok) throw new Error("Failed to fetch");

      const data = await res.json();
      if (!isMounted) return;

      if (data.stations && data.stations.length > 0) {
        const validStations = data.stations.filter(st => 
          st.responders?.some(r => r.latitude && r.longitude)
        );

        setStations(validStations);

        if (validStations.length === 0) {
          setResponderCoords(null);
          setResponderInfo(null);
          return;
        }
        console.log("Stations data: " , JSON.stringify(stations, null , 2));

        const stationExists = selectedStation && validStations.find(s => s.station_name === selectedStation);
        const stationToUse = stationExists ? selectedStation : validStations[0].station_name;

        if (selectedStation !== stationToUse) setSelectedStation(stationToUse);

        const selectedData = validStations.find(s => s.station_name === stationToUse);
        const validResponders = (selectedData?.responders || []).filter(r => r.latitude && r.longitude);

        if (!validResponders.length) return;

        let nearest = validResponders[0];
        let minDistance = getDistance(incidentCoords, [parseFloat(nearest.longitude), parseFloat(nearest.latitude)]);

        for (const r of validResponders) {
          const dist = getDistance(incidentCoords, [parseFloat(r.longitude), parseFloat(r.latitude)]);
          if (dist < minDistance) {
            minDistance = dist;
            nearest = r;
          }
        }

        // 2. FORCE PARSE TO FLOATS
        setResponderCoords([parseFloat(nearest.longitude), parseFloat(nearest.latitude)]);
        setResponderInfo({
          ...nearest,
          station_name: selectedData?.station_name || "Unknown"
        });
      }
    } catch (e) {
      console.log("Responder fetch error:", e);
    }
  }, [incidentCoords, token, selectedStation, incidentId]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;

    const poll = async () => {
      await fetchAcceptedResponders(isMounted);
      if (isMounted) {
        timeoutId = setTimeout(poll, 1000); 
      }
    };

    poll();
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fetchAcceptedResponders]);

  useEffect(() => {
    const updateRoute = async () => {
      if (!responderCoords || !incidentCoords) return;

      if (lastRoutedCoords.current) {
        const distMoved = getDistance(lastRoutedCoords.current, responderCoords);
        // Change this from 20 to 5 (or even 2 if you are testing by walking around)
        if (distMoved < 5) return; 
      }

      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${responderCoords[0]},${responderCoords[1]};${incidentCoords[0]},${incidentCoords[1]}?geometries=geojson&access_token=${RNMAPBOX_MAPS_DOWNLOAD_TOKEN}`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.routes && json.routes.length > 0) {
          const route = json.routes[0];
          setRouteData({
            coords: route.geometry.coordinates,
            duration: route.duration,
            distance: route.distance,
            steps: route.legs?.[0]?.steps || []
          });
          lastRoutedCoords.current = responderCoords;
        }
      } catch (e) {
        console.error("Error fetching route:", e);
      }
    };
    updateRoute();
  }, [responderCoords, incidentCoords]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isSheetCollapsed ? Math.max(0, sheetHeight - 72) : 0,
      duration: 220,
      useNativeDriver: true
    }).start();
  }, [isSheetCollapsed, sheetHeight, slideAnim]);

  useEffect(() => {
    if (!navigationActive || !responderCoords || !routeData.coords?.length) return;

    const nextHeading = getBearing(responderCoords, routeData.coords[Math.min(routeData.coords.length - 1, 1)]);
    setNavigationHeading(nextHeading);
  }, [navigationActive, responderCoords, routeData.coords]);

  const formatTime = (seconds) => {
    if (seconds == null) return '--';
    const mins = Math.ceil(seconds / 60);
    return mins > 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;
  };

  const toggleSheet = () => {
    setIsSheetCollapsed(prev => !prev);
  };

  const formatDistance = (meters) => {
    if (meters == null) return '--';
    return meters > 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
  };

  const getBearing = (fromCoord, toCoord) => {
    if (!fromCoord || !toCoord) return 0;
    const [lon1, lat1] = fromCoord;
    const [lon2, lat2] = toCoord;
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const lat1Rad = lat1 * (Math.PI / 180);
    const lat2Rad = lat2 * (Math.PI / 180);
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  const getRouteLookAheadCoord = (currentCoord, routeCoords) => {
    if (!currentCoord || !routeCoords?.length) return currentCoord;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    routeCoords.forEach((coord, index) => {
      const dist = getDistance(currentCoord, coord);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = index;
      }
    });

    const lookAheadIndex = Math.min(routeCoords.length - 1, bestIndex + Math.max(6, Math.floor(routeCoords.length / 20)));
    return routeCoords[lookAheadIndex] || currentCoord;
  };

  const getActiveStep = (currentCoord, steps = []) => {
    if (!currentCoord || !steps.length) return null;

    let bestStep = steps[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    steps.forEach((step) => {
      const stepCoord = step?.maneuver?.location;
      if (!stepCoord) return;
      const dist = getDistance(currentCoord, [stepCoord[0], stepCoord[1]]);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestStep = step;
      }
    });

    return bestStep;
  };

  const mapStyleOptions = {
    street: 'mapbox://styles/mapbox/streets-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  };

  const getDistanceToRoute = (currentCoord, routeCoords) => {
    if (!currentCoord || !routeCoords?.length) return Number.POSITIVE_INFINITY;
    let minDistance = Number.POSITIVE_INFINITY;

    routeCoords.forEach((coord) => {
      const dist = getDistance(currentCoord, coord);
      if (dist < minDistance) minDistance = dist;
    });

    return minDistance;
  };

  const handleNavigate = () => {
    if (!incidentCoords) return;
    const [lng, lat] = incidentCoords;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const url = Platform.select({
      ios: `${scheme}Incident Location@${lat},${lng}`,
      android: `${scheme}${lat},${lng}(Incident Location)`
    });
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    
    Linking.canOpenURL(url).then(supported => 
      supported ? Linking.openURL(url) : Linking.openURL(webUrl)
    ).catch(() => Linking.openURL(webUrl));
  };

  const toggleNavigation = () => {
    const nextState = !navigationActive;
    setNavigationActive(nextState);
    setNavigationPitch(nextState ? 60 : 0);
    if (!nextState) {
      setNavigationHeading(0);
    }
  };

  const navLookAhead = navigationActive && routeData.coords && responderCoords
    ? getRouteLookAheadCoord(responderCoords, routeData.coords)
    : null;
  const cameraTarget = navLookAhead 
  ? [navLookAhead[0], navLookAhead[1] + 0.00045] 
  : (responderCoords || incidentCoords || [0, 0]);
  const activeStep = getActiveStep(responderCoords, routeData.steps || []);
  const activeInstruction = activeStep?.maneuver?.instruction || 'Follow the route to the incident location';
  const remainingDistance = navigationActive ? routeData.distance : null;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
        <View style={styles.headerOverlay}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
              <Icon name="arrow-left" size={24} color="#1F2937" />
            </TouchableOpacity>
            <View style={styles.titleBadge}>
              <Text style={styles.headerTitle}>{t('track') || "Track Responder"}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={toggleNavigation} style={[styles.iconButton, styles.primaryShadow]}>
              <Icon
                name={navigationActive ? 'crosshairs-off' : 'navigation'}
                size={24}
                color="#2563EB"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleNavigate} style={[styles.iconButton, styles.primaryShadow]}>
              <Icon name="directions" size={24} color="#336fe8" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.mapControls}>
        {Object.entries(mapStyleOptions).map(([key, url]) => {
          const label = key === 'street' ? 'Street' : key === 'satellite' ? 'Satellite' : 'Dark';
          const isActive = mapStyle === key;
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.85}
              onPress={() => setMapStyle(key)}
              style={[styles.mapStyleButton, isActive && styles.mapStyleButtonActive]}
            >
              <Text style={[styles.mapStyleText, isActive && styles.mapStyleTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <MapboxGL.MapView style={styles.map} styleURL={mapStyleOptions[mapStyle]} onDidFinishLoadingMap={() => setMapLoaded(true)}>
        <MapboxGL.Camera
          zoomLevel={navigationActive ? 16 : 14}
          centerCoordinate={cameraTarget}
          heading={navigationActive ? navigationHeading : 0}
          pitch={navigationActive ? navigationPitch : 0}
          animationMode="easeTo"
          animationDuration={navigationActive ? 1200 : 2500}
        />
        <MapboxGL.UserLocation visible={true} />

        <MapboxGL.Images images={{ incident: require('../../assets/crisis.png'), responder: require('../../assets/rescuer.png') }} />

        {/* Dynamic Route Line */}
        {mapLoaded && routeData.coords ? (
          <MapboxGL.ShapeSource id="routeSource" shape={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeData.coords } }}>
            <MapboxGL.LineLayer id="routeLine" style={{ lineColor: '#007AFF', lineWidth: 6, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.85 }} />
            <MapboxGL.LineLayer id="routeLineBg" style={{ lineColor: '#FFFFFF', lineWidth: 10, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.5 }} />
          </MapboxGL.ShapeSource>
        ) : null}

        {/* Incident Marker */}
        {mapLoaded && incidentCoords ? (
          <MapboxGL.ShapeSource
            id="incident-source"
            shape={{
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: incidentCoords },
                properties: {}
              }]
            }}
          >
            <MapboxGL.SymbolLayer
              id="incident-layer"
              style={{
                iconImage: 'incident',
                iconSize: 0.9,
                iconAnchor: 'bottom',
                iconAllowOverlap: true,
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}

        {/* Responder Marker */}
        {mapLoaded && responderCoords ? (
          <MapboxGL.ShapeSource
            id="responder-source"
            shape={{
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: responderCoords },
                properties: {}
              }]
            }}
          >
            <MapboxGL.SymbolLayer
              id="responder-layer"
              style={{
                iconImage: 'responder',
                iconSize: 0.9,
                iconAnchor: 'bottom',
                iconAllowOverlap: true,
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}
      </MapboxGL.MapView>

      {navigationActive ? (
        <View style={styles.navigationCard}>
          <View style={styles.navigationCardHeader}>
            <View style={styles.navigationIconCircle}>
              <Icon name="navigation-variant" size={20} color="#fff" />
            </View>
            <View style={styles.navigationTextWrap}>
              <Text style={styles.navigationTitle}>Navigation</Text>
              <Text style={styles.navigationSubtitle}>{activeInstruction}</Text>
            </View>
          </View>
          <View style={styles.navigationStats}>
            <View style={styles.navigationStatBox}>
              <Text style={styles.navigationStatValue}>{formatDistance(remainingDistance)}</Text>
              <Text style={styles.navigationStatLabel}>Remaining</Text>
            </View>
            <View style={styles.navigationStatBox}>
              <Text style={styles.navigationStatValue}>{formatTime(routeData.duration)}</Text>
              <Text style={styles.navigationStatLabel}>ETA</Text>
            </View>
          </View>
        </View>
      ) : null}

      <Animated.View
        style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity activeOpacity={0.8} onPress={toggleSheet} style={styles.dragHandleButton}>
          <View style={styles.dragHandle} />
        </TouchableOpacity>
        
        <View style={[styles.sheetContent, isSheetCollapsed && styles.sheetContentCollapsed]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('resinfo') || "Dispatch Details"}</Text>
            
            {/* CRASH FIX: Checks explicitly for null so numbers like '0' aren't rendered as raw text */}
            {routeData.duration != null ? (
              <View style={styles.etaContainer}>
                <View style={styles.etaBadge}>
                  <Icon name="clock-fast" size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.etaText}>{formatTime(routeData.duration)}</Text>
                </View>
                <Text style={styles.distanceText}>{formatDistance(routeData.distance)} away</Text>
              </View>
            ) : null}
          </View>

          {stations.length > 0 ? (
            <View style={styles.pickerWrapper}>
              <Icon name="office-building-marker" size={20} color="#6B7280" style={styles.pickerIcon} />
              <Picker selectedValue={selectedStation} onValueChange={setSelectedStation} style={styles.picker} dropdownIconColor="#374151">
                {stations.map(st => <Picker.Item key={st.station_id} label={st.station_name} value={st.station_name} style={styles.pickerItem} />)}
              </Picker>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Icon name="map-marker-off" size={32} color="#9CA3AF" />
              <Text style={styles.emptyText}>{t('nostationres') || "No active responders nearby"}</Text>
            </View>
          )}

          {/* Using safer ternary operators to prevent component fall-throughs */}
          {responderInfo ? (
            <View style={styles.responderCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitials}>
                  {responderInfo.firstName?.[0]}{responderInfo.lastName?.[0]}
                </Text>
              </View>
              <View style={styles.responderInfo}>
                <Text style={styles.responderName}>{responderInfo.firstName} {responderInfo.lastName}</Text>
                <Text style={styles.responderRole}>{responderInfo.role} • {responderInfo.station_name}</Text>
              </View>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{responderInfo.status || 'En Route'}</Text>
              </View>
            </View>
          ) : stations.length > 0 ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.loadingText}>{t('searching') || "Acquiring live location..."}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  map: { flex: 1 },
  
  headerSafeArea: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 20 : 0,
    width: '100%',
    zIndex: 10,
  },
  headerOverlay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  titleBadge: {
    marginLeft: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  headerActions: { flexDirection: 'row', gap: 8 },
  primaryShadow: { shadowColor: '#e93867', shadowOpacity: 0.2 },
  mapControls: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 86 : 70,
    right: 16,
    zIndex: 12,
    flexDirection: 'row',
    gap: 8,
  },
  mapStyleButton: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapStyleButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  mapStyleText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  mapStyleTextActive: { color: '#FFFFFF' },

  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  markerImage: { width: 55, height: 55, dropShadow: '0px 4px 6px rgba(0,0,0,0.3)' },
  mapLabel: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: -5,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 2,
  },
  mapLabelText: { fontSize: 11, fontWeight: '800', color: '#EF4444', textTransform: 'uppercase' },

  navigationCard: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 120 : 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    padding: 16,
    zIndex: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  navigationCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  navigationIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  navigationTextWrap: { flex: 1 },
  navigationTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  navigationSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  navigationStats: { flexDirection: 'row', gap: 10 },
  navigationStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  navigationStatValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  navigationStatLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
    elevation: 24,
  },
  dragHandleButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dragHandle: {
    width: 48,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    alignSelf: 'center',
  },
  sheetContent: { width: '100%' },
  sheetContentCollapsed: { height: 0, opacity: 0 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, marginTop: 8 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827', flex: 1 },
  etaContainer: { alignItems: 'flex-end' },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#336fe8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 4,
  },
  etaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  distanceText: { color: '#6B7280', fontSize: 12, fontWeight: '600' },

  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerIcon: { paddingLeft: 16 },
  picker: { flex: 1, height: 54 },
  pickerItem: { fontSize: 15, fontWeight: '500', color: '#1F2937' },

  responderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarInitials: { color: '#2957d6', fontSize: 18, fontWeight: '800' },
  responderInfo: { flex: 1 },
  responderName: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  responderRole: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A', marginRight: 6 },
  statusText: { color: '#166534', fontSize: 12, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#9CA3AF', fontSize: 15, fontWeight: '500', marginTop: 12 },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 24,
  },
  loadingText: { marginLeft: 12, color: '#64748B', fontSize: 14, fontWeight: '600' },
});

export default TrackLocationScreen;