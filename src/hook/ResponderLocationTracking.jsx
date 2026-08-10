import { SERVER_URL } from '@env';
import MapboxGL from '@rnmapbox/maps';
import axios from 'axios';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';

const LOCATION_ENDPOINT = `${SERVER_URL}/updateResponders_location`;
const MIN_DISTANCE = 8;        // Reduced to 8 meters for tighter, snappier tracking
const MIN_INTERVAL = 4000;     // Throttle limit reduced to 4 seconds for high responsiveness
const MAX_RETRIES = 2;         // Reduced retry count to clear thread execution quickly
const MAX_QUEUE_SIZE = 30;

const locationAxios = axios.create({
  timeout: 4000, // Faster timeout to prevent connection hanging
});

let permissionCached = false;
let permissionGranted = false;

const ResponderLocationTracking = () => {
  const { authData, isOnline } = useContext(AuthContext);
  const appStateRef = useRef(AppState.currentState);
  const lastLocationRef = useRef(null);
  const lastSentRef = useRef(0);
  const isTrackingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const offlineQueueRef = useRef([]);
  const queueProcessingRef = useRef(false);
  const permissionRequestInProgressRef = useRef(false);
  const { t } = useTranslation();

  const isResponder = useCallback(() => {
    return (
      authData?.token &&
      authData?.id &&
      (authData?.role === 'responder_personnel' || authData?.role === 'responder_head')
    );
  }, [authData?.token, authData?.id, authData?.role]);

  const requestLocationPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    if (permissionCached) return permissionGranted;

    if (permissionRequestInProgressRef.current) {
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (permissionCached) {
            clearInterval(checkInterval);
            resolve(permissionGranted);
          }
        }, 50);
      });
    }

    permissionRequestInProgressRef.current = true;
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

      permissionCached = true;
      permissionGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
      
      if (!permissionGranted) {
        if (granted === PermissionsAndroid.RESULTS.DENIED) {
          Alert.alert(t('Location Permission Required'), t('allowlocation'), [
            { text: t('no'), style: 'cancel' },
            { text: t('yes'), onPress: () => requestLocationPermission() },
          ]);
        } else if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          Alert.alert(t('Enable Location in Settings'), t('enableperset'), [
            { text: t('cancel'), style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
        }
      }
      return permissionGranted;
    } catch (error) {
      permissionGranted = false;
      return false;
    } finally {
      permissionRequestInProgressRef.current = false;
    }
  }, [t]);

  const sendLocation = useCallback(async (latitude, longitude, retryCount = 0) => {
    if (!isOnline) {
      if (offlineQueueRef.current.length < MAX_QUEUE_SIZE) {
        offlineQueueRef.current.push({ latitude, longitude, timestamp: Date.now() });
      }
      return false;
    }

    try {
      await locationAxios.post(
        LOCATION_ENDPOINT,
        { user_id: authData.id, latitude, longitude },
        {
          headers: { Authorization: `Bearer ${authData.token}` },
          signal: abortControllerRef.current?.signal,
        }
      );
      return true;
    } catch (error) {
      if (axios.isCancel(error)) return false;

      if (retryCount < MAX_RETRIES) {
        // Linear quick backoff for speed
        await new Promise(res => setTimeout(res, 1000 * (retryCount + 1)));
        return sendLocation(latitude, longitude, retryCount + 1);
      }
      return false;
    }
  }, [isOnline, authData?.token, authData?.id]);

  // OPTIMIZATION: Equirectangular approximation (10x faster than Haversine for local tracking)
  const getFastDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371000; 
    const k = Math.PI / 180;
    const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) * k) / 2);
    const y = (lat2 - lat1) * k;
    return Math.sqrt(x * x + y * y) * R;
  }, []);

  // OPTIMIZATION: Event listener callback instead of fixed interval execution
  const handleLocationUpdate = useCallback((location) => {
    if (!location?.coords || !isResponder()) return;

    const { latitude, longitude } = location.coords;
    const now = Date.now();
    const last = lastLocationRef.current;

    if (last) {
      const timePassed = now - lastSentRef.current;
      // Fast check: If it has been less than 4 seconds, verify movement
      if (timePassed < MIN_INTERVAL) {
        const distance = getFastDistance(last.latitude, last.longitude, latitude, longitude);
        if (distance < MIN_DISTANCE) return; // Skip if they haven't moved much
      }
    }

    // Immediately cache variables to prevent race condition delays
    lastLocationRef.current = { latitude, longitude };
    lastSentRef.current = now;

    sendLocation(latitude, longitude);
  }, [isResponder, getFastDistance, sendLocation]);

  useEffect(() => {
    if (!isResponder()) return;

    let appStateSubscription = null;

    const startTracking = async () => {
      if (isTrackingRef.current) return;

      const permission = await requestLocationPermission();
      if (!permission) return;

      try {
        isTrackingRef.current = true;
        abortControllerRef.current = new AbortController();

        MapboxGL.locationManager.start();
        
        // OPTIMIZATION: Subscribe to continuous live location stream changes immediately
        MapboxGL.locationManager.addListener(handleLocationUpdate);
        
        // Force trigger immediate baseline setup
        const initialLoc = await MapboxGL.locationManager.getLastKnownLocation();
        if (initialLoc) handleLocationUpdate(initialLoc);

      } catch (error) {
        console.warn('Tracking setup failed:', error.message);
        isTrackingRef.current = false;
      }
    };

    const stopTracking = () => {
      isTrackingRef.current = false;
      abortControllerRef.current?.abort();
      try {
        MapboxGL.locationManager.removeListener(handleLocationUpdate);
        MapboxGL.locationManager.stop();
      } catch (e) {
        // Silent catch to prevent crash on quick unmounts
      }
    };

    const handleAppStateChange = nextState => {
      const oldState = appStateRef.current;
      if (oldState.match(/inactive|background/) && nextState === 'active') {
        startTracking();
      } else if (nextState.match(/inactive|background/)) {
        stopTracking();
      }
      appStateRef.current = nextState;
    };

    startTracking();
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopTracking();
      appStateSubscription?.remove();
    };
  }, [isResponder, requestLocationPermission, handleLocationUpdate]);

  return null;
};

export default ResponderLocationTracking;