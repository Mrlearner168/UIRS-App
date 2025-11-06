import { SERVER_URL } from '@env';
import MapboxGL from '@rnmapbox/maps';
import axios from 'axios';
import { useContext, useEffect, useRef } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';

const LOCATION_ENDPOINT = `${SERVER_URL}/updateResponders_location`;
const MIN_DISTANCE = 25; // meters
const MIN_INTERVAL = 30000; // milliseconds (60 sec)

const requestLocationPermission = async () => {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'App needs location permission for responder tracking',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Location permission error:', error);
    return false;
  }
};

const ResponderLocationTracking = () => {
  const { authData } = useContext(AuthContext);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const lastLocationRef = useRef(null);
  const lastSentRef = useRef(0);

  const sendLocation = async (latitude, longitude) => {
    try {
      await axios.post(
        LOCATION_ENDPOINT,
        { user_id: authData.id, latitude, longitude },
        { headers: { Authorization: `Bearer ${authData.token}` } }
      );
    } catch (error) {
      console.log('Failed to send location:', error.message);
    }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // meters
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const trackLocation = async () => {
    if (
      !authData.token ||
      !authData.id ||
      (authData.role !== 'responder_personnel' && authData.role !== 'responder_head')
    ) return;

    try {
      const location = await MapboxGL.locationManager.getLastKnownLocation();
      if (!location) return;

      const { latitude, longitude } = location.coords;

      const last = lastLocationRef.current;
      const distance = last
        ? getDistance(last.latitude, last.longitude, latitude, longitude)
        : Infinity;

      const now = Date.now();
      if (distance >= MIN_DISTANCE || now - lastSentRef.current >= MIN_INTERVAL) {
        sendLocation(latitude, longitude);
        lastLocationRef.current = { latitude, longitude };
        lastSentRef.current = now;
      }
    } catch (error) {
      console.log('Mapbox location error:', error.message);
    }
  };

  useEffect(() => {
    if (authData.role !== 'responder_personnel' && authData.role !== 'responder_head') return;

    const startTracking = async () => {
      const permission = await requestLocationPermission();
      if (!permission) {
        console.warn('Location permission denied');
        return;
      }

      MapboxGL.locationManager.start(); // start Mapbox updates
      trackLocation(); // initial update
      intervalRef.current = setInterval(trackLocation, 10000); // 30 sec
    };

    const stopTracking = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      MapboxGL.locationManager.stop();
    };

    const handleAppStateChange = nextState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        startTracking();
      } else if (nextState.match(/inactive|background/)) {
        stopTracking();
      }
      appStateRef.current = nextState;
    };

    startTracking();
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopTracking();
      subscription.remove();
    };
  }, [authData.role, authData.token, authData.id]);
};

export default ResponderLocationTracking;
