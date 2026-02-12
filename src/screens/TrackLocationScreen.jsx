import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN, SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import MapboxGL from '@rnmapbox/maps';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

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
  const {t} = useTranslation();


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
  // Fetch responders
  const fetchAcceptedResponders = async () => {
    if (!incidentCoords || !token) return;
    try {
      const res = await fetch(`${SERVER_URL}/incident/${incidentId}/accepted_responders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      console.log("Accepted responders fetched:", JSON.stringify(data, null, 2));

      if (res.ok && data.stations && data.stations.length > 0) {
        setStations(data.stations);

        const stationToUse = selectedStation || data.stations[0].station_name;
        setSelectedStation(stationToUse);

        const selectedData = data.stations.find(s => s.station_name === stationToUse);
        const validResponders = (selectedData?.responders || []).filter(
          r => r.latitude && r.longitude
        );

        if (!validResponders.length) {
          setResponderCoords(null);
          setResponderId(null);
          setResponderInfo(null);
          return;
        }

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

        const nearestCoords = [nearestResponder.longitude, nearestResponder.latitude];
        console.log("Nearest responder coordinates:", nearestCoords);

        setResponderCoords(nearestCoords);
        setResponderId(nearestResponder.id);
        setResponderInfo({
          firstName: nearestResponder.firstName,
          lastName: nearestResponder.lastName,
          status: nearestResponder.status,
          role: nearestResponder.role,
          station_name: selectedData?.station_name || "Unknown"
        });
      } else {
        setResponderCoords(null);
        setResponderId(null);
        setResponderInfo(null);
      }
    } catch (e) {
      console.log("Failed to fetch responders:", e);
      setResponderCoords(null);
      setResponderId(null);
      setResponderInfo(null);
    }
  };
  // Parse incident location properly
  useEffect(() => {
    if (!incidentLocation) return;
    let coordsArray = typeof incidentLocation === 'string'
      ? incidentLocation.split(',').map(Number)
      : incidentLocation;

    // Check if data is in [lat, lon] format (most APIs use this)
    if (coordsArray.length === 2 && coordsArray.every(n => !isNaN(n))) {
      // Correct order for Mapbox: [longitude, latitude]
      setIncidentCoords([coordsArray[1], coordsArray[0]]);
      console.log("Incident coordinates set:", [coordsArray[1], coordsArray[0]]);
    } else {
      console.log('Invalid incidentLocation format:', incidentLocation);
    }
  }, [incidentLocation]);

  function getDistance(coord1, coord2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    const R = 6371000;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const a = Math.sin(Δφ / 2) ** 2 +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  // Fetch route and ETA from Mapbox
  const fetchRouteWithDuration = async (origin, destination) => {
    try {
      console.log("Fetching route from:", origin, "to:", destination);
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=geojson&access_token=${RNMAPBOX_MAPS_DOWNLOAD_TOKEN}`;
      const res = await fetch(url);
      const json = await res.json();
      console.log("Mapbox response:", JSON.stringify(json, null, 2));
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

  useEffect(() => {
    fetchAcceptedResponders();
    const intervalId = setInterval(fetchAcceptedResponders, 10000);
    return () => clearInterval(intervalId);
  }, [incidentCoords, token, selectedStation]);

  // Fetch route and duration when coordinates are ready
  useEffect(() => {
    const fetchRoutes = async () => {
      if (!responderCoords || !incidentCoords) return;
      const routeResult = await fetchRouteWithDuration(responderCoords, incidentCoords);
      if (routeResult) {
        setRouteCoords(routeResult.coords);
        setRouteDuration(routeResult.duration);
        console.log("Route duration:", routeResult.duration);
      } else {
        console.log("No route found, setting fallback.");
        setRouteCoords([responderCoords, incidentCoords]);
        setRouteDuration(null);
      }
    };
    fetchRoutes();
  }, [responderCoords, incidentCoords]);
  useEffect(() => {
    if (!selectedStation || !stations || stations.length === 0) return;

    const selected = stations.find(st => st.station_name === selectedStation);
    if (!selected || !selected.responders || selected.responders.length === 0) {
      setResponderInfo(null);
      setResponderCoords(null);
      setRouteCoords(null);
      setRouteDuration(null);
      return;
    }

    // Use the first responder in that station
    const responder = selected.responders[0];
    const newResponderCoords = [responder.longitude, responder.latitude];

    setResponderInfo({
      firstName: responder.firstName,
      lastName: responder.lastName,
      status: responder.status,
      role: responder.role,
      station_name: selected.station_name
    });
    setResponderCoords(newResponderCoords);

    // Fetch route and ETA immediately when station changes
    if (incidentCoords && newResponderCoords) {
      fetchRouteWithDuration(newResponderCoords, incidentCoords).then((routeResult) => {
        if (routeResult) {
          setRouteCoords(routeResult.coords);
          setRouteDuration(routeResult.duration);
        } else {
          setRouteCoords([newResponderCoords, incidentCoords]);
          setRouteDuration(null);
        }
      });
    }
  }, [selectedStation, stations, incidentCoords]);

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const totalSeconds = Math.floor(seconds);
    const minSeconds = 120;
    const displaySeconds = totalSeconds < minSeconds ? minSeconds : totalSeconds;
    const minutes = Math.floor(displaySeconds / 60);
    const remainderSeconds = displaySeconds % 60;
    return `${minutes} min : ${remainderSeconds} sec`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
        <Text style={styles.closeText}>X</Text>
      </TouchableOpacity>

      {(!incidentCoords && !userCoords) && (
        <View style={styles.loadingContainer}>
          <Text>{t('loadingmap')}</Text>
        </View>
      )}

      {(incidentCoords || userCoords) && (
        <MapboxGL.MapView
          style={styles.map}
          onDidFinishLoadingMap={() => setMapLoaded(true)}
        >
          <MapboxGL.Camera
            zoomLevel={12}
            centerCoordinate={incidentCoords ?? [0, 0]}
          />

          <MapboxGL.UserLocation
            visible
            onUpdate={(location) =>
              setUserCoords([location.coords.longitude, location.coords.latitude])
            }
          />

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
                  lineColor: 'green',
                  lineWidth: 2,
                  lineCap: 'round',
                  lineJoin: 'round'
                }}
              />
            </MapboxGL.ShapeSource>
          )}

          {/* Responders with floating name + station labels */}
          {mapLoaded &&
            stations.length > 0 &&
            stations
              .filter(st => st.responders && st.responders.length > 0)
              .flatMap(st =>
                st.responders
                  .filter(r => r.latitude && r.longitude)
                  .map((responder) => (
                    <MapboxGL.PointAnnotation
                      key={`responder-${responder.id}`}
                      id={`responder-${responder.id}`}
                      coordinate={[responder.longitude, responder.latitude]}
                      anchor={{ x: 0.5, y: 1 }} // Center horizontally, bottom aligns to pin
                    >
                      <View style={{ alignItems: 'center' }}>
                        {/* Floating info container above the pin */}
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: 'white',
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#ccc',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            marginBottom: 6,
                            elevation: 4,
                            shadowColor: '#000',
                            shadowOpacity: 0.25,
                            shadowRadius: 2,
                          }}
                        >
                          <Text >
                            {responder.firstName} {responder.lastName}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#666' }}>
                            {st.station_name}
                          </Text>
                        </View>
                        
                        {/* Marker icon */}
                        
                      </View>
                    </MapboxGL.PointAnnotation>
                  ))
              )}
          

          {/* Incident marker with label above */}
          {mapLoaded && incidentCoords && (
            <MapboxGL.PointAnnotation id="incident-marker" coordinate={incidentCoords}>
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    backgroundColor: '#ffeded',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#e06666',
                    marginBottom: 5,
                    shadowColor: '#000',
                    shadowOpacity: 0.25,
                    shadowRadius: 2,
                    elevation: 3,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#b10000' }}>
                    Incident Location
                  </Text>
                </View>
                <View style={styles.incidentMarker} />
              </View>
            </MapboxGL.PointAnnotation>
          )}

          

        </MapboxGL.MapView>

      )}
      


      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{t('resinfo')}</Text>
          
        {/* Station Picker */}
        {stations && stations.filter(st => st.responders && st.responders.length > 0).length > 0 ? (
          <Picker
            selectedValue={selectedStation}
            onValueChange={(value) => setSelectedStation(value)}
            style={styles.picker}
            dropdownIconColor="black"
          >
            <Picker.Item label={t('selectstation')} value={null} />
            {stations
              .filter(st => st.responders && st.responders.length > 0)
              .map((station) => (
                <Picker.Item
                  key={station.station_id}
                  label={station.station_name}
                  value={station.station_name}
                />
              ))}
          </Picker>

        ) : (
          <Text style={styles.infoText}>{t('nostationres')}</Text>
        )}
      
        {/* Responder Info */}
        {selectedStation && responderInfo ? (
          <>
            <Text style={styles.infoText}>{t('firstname')} {responderInfo.firstName} {responderInfo.lastName}</Text>
            <Text style={styles.infoText}>{t('status')} {responderInfo.status}</Text>
            <Text style={styles.infoText}>{t('role')}{responderInfo.role}</Text>
            <Text style={styles.infoText}>{t('station')} {responderInfo.station_name}</Text>
            {routeDuration ? (
              <Text style={styles.infoText}>ETA: {formatDuration(routeDuration)}</Text>
            ) : (
              <Text style={styles.infoText}>ETA: calculating...</Text>
            )}
          </>
        ) : (
          <Text style={styles.infoText}>{t('noresponders')}</Text>
        )}
      </View>
      

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  incidentMarker: {
    width: 15,
    height: 15,
    backgroundColor: 'red',
    borderRadius: 10,
    borderWidth: 5,
    borderColor: 'white'
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 18,
    lineHeight: 18
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBox: {
    position: 'absolute',
    top: 40,
    left: 15,
    width: 220,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 8,
    padding: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    zIndex: 20
  },
  infoTitle: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#222',
    marginBottom: 4
  },
  picker: {
    height: 55,
    width: '100%',
    backgroundColor: '#f3f3f3',
    borderRadius: 6,
    marginBottom: 8,
    color: 'black'
  },
  infoText: {
    fontSize: 13,
    color: '#333',
    marginBottom: 2
  }
});

export default TrackLocationScreen;
