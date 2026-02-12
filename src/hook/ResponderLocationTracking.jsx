import { SERVER_URL } from '@env';
import MapboxGL from '@rnmapbox/maps';
import axios from 'axios';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import { AuthContext } from '../context/AuthContext';

const LOCATION_ENDPOINT = `${SERVER_URL}/updateResponders_location`;
const MIN_DISTANCE = 25; // meters
const MIN_INTERVAL = 30000; // milliseconds (30 sec)
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // milliseconds
const MAX_QUEUE_SIZE = 50; // Prevent unbounded memory growth
const QUEUE_EXPIRY = 1800000; // 30 minutes

// Create axios instance with timeout
const locationAxios = axios.create({
  timeout: 5000,
});

// Track permission state globally to avoid repeated checks
let permissionCached = false;
let permissionGranted = false;

const ResponderLocationTracking = () => {
  const { authData, isOnline } = useContext(AuthContext);
  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const lastLocationRef = useRef(null);
  const lastSentRef = useRef(0);
  const isTrackingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const offlineQueueRef = useRef([]);
  const queueProcessingRef = useRef(false);
  const permissionRequestInProgressRef = useRef(false);
  const { t } = useTranslation();

  // Validate auth data - memoized to avoid recreation
  const isResponder = useCallback(() => {
    return (
      authData?.token &&
      authData?.id &&
      (authData?.role === 'responder_personnel' || authData?.role === 'responder_head')
    );
  }, [authData?.token, authData?.id, authData?.role]);

  const requestLocationPermission = useCallback(async () => {
    // Early return for non-Android or cached permission
    if (Platform.OS !== 'android') return true;
    if (permissionCached) return permissionGranted;

    // Prevent multiple concurrent requests
    if (permissionRequestInProgressRef.current) {
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (permissionCached) {
            clearInterval(checkInterval);
            resolve(permissionGranted);
          }
        }, 100);
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

      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        permissionGranted = true;
        return true;
      }

      permissionGranted = false;

      if (granted === PermissionsAndroid.RESULTS.DENIED) {
        Alert.alert(
          'Location Permission Required',
          t('allowlocation'),
          [
            { text: t('no'), style: 'cancel' },
            { text: t('yes'), onPress: () => requestLocationPermission() },
          ]
        );
      }

      if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Alert.alert(
          'Enable Location in Settings',
          t('enableperset'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      }

      return false;
    } catch (error) {
      console.warn('Location permission error:', error.message);
      permissionGranted = false;
      return false;
    } finally {
      permissionRequestInProgressRef.current = false;
    }
  }, [t]);

  // Send location with retry logic - memoized for performance
  const sendLocation = useCallback(async (latitude, longitude, retryCount = 0) => {
    // Validate input early
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !isFinite(latitude) || !isFinite(longitude)) {
      console.warn('Invalid coordinates');
      return false;
    }

    if (!isOnline) {
      // Queue for later when online
      if (offlineQueueRef.current.length < MAX_QUEUE_SIZE) {
        offlineQueueRef.current.push({ latitude, longitude, timestamp: Date.now() });
      }
      return false;
    }

    if (!authData?.token || !authData?.id) {
      console.warn('Missing authentication');
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
      if (axios.isCancel(error)) {
        return false;
      }

      // Retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount);
        setTimeout(() => {
          sendLocation(latitude, longitude, retryCount + 1);
        }, delay);
        return false;
      }

      // Max retries exceeded, queue for later if offline
      if (!isOnline && offlineQueueRef.current.length < MAX_QUEUE_SIZE) {
        offlineQueueRef.current.push({ latitude, longitude, timestamp: Date.now() });
      }
      return false;
    }
  }, [isOnline, authData?.token, authData?.id]);

  // Process queued locations - memoized with debouncing
  const processOfflineQueue = useCallback(async () => {
    if (!isOnline || offlineQueueRef.current.length === 0 || queueProcessingRef.current) {
      return;
    }

    queueProcessingRef.current = true;

    try {
      const queue = [...offlineQueueRef.current];
      offlineQueueRef.current = [];
      const now = Date.now();
      let processedCount = 0;

      for (const item of queue) {
        // Skip old entries
        if (now - item.timestamp > QUEUE_EXPIRY) {
          continue;
        }

        const success = await sendLocation(item.latitude, item.longitude);
        if (success) {
          processedCount++;
        } else {
          // Re-queue if failed (but limit queue size)
          if (offlineQueueRef.current.length < MAX_QUEUE_SIZE) {
            offlineQueueRef.current.push(item);
          }
        }

        // Brief pause to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.warn('Queue processing error:', error.message);
    } finally {
      queueProcessingRef.current = false;
    }
  }, [isOnline, sendLocation]);

  // Optimized distance calculation
  const getDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371000; // meters
    const toRad = x => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    // Early return for minimal differences
    if (Math.abs(dLat) < 0.00001 && Math.abs(dLon) < 0.00001) {
      return 0;
    }

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, []);

  const trackLocation = useCallback(async () => {
    if (!isResponder()) return;

    try {
      const location = await MapboxGL.locationManager.getLastKnownLocation();
      if (!location?.coords) {
        return;
      }

      const { latitude, longitude } = location.coords;

      // Validate coordinates
      if (
        typeof latitude !== 'number' ||
        typeof longitude !== 'number' ||
        !isFinite(latitude) ||
        !isFinite(longitude)
      ) {
        return;
      }

      const last = lastLocationRef.current;
      const now = Date.now();
      const timeSinceLastSent = now - lastSentRef.current;

      // Check time threshold first (faster than distance calculation)
      if (timeSinceLastSent < MIN_INTERVAL) {
        if (!last) return; // No location to compare distance with

        const distance = getDistance(last.latitude, last.longitude, latitude, longitude);
        if (distance < MIN_DISTANCE) {
          return;
        }
      }

      // Send location and update refs only on success
      const success = await sendLocation(latitude, longitude);
      if (success) {
        lastLocationRef.current = { latitude, longitude };
        lastSentRef.current = now;
      }
    } catch (error) {
      console.log('Tracking error:', error.message);
    }
  }, [isResponder, getDistance, sendLocation]);

  useEffect(() => {
    if (!isResponder()) return;

    let appStateSubscription = null;
    let queueProcessingTimeout = null;

    const startTracking = async () => {
      if (isTrackingRef.current) {
        return;
      }

      const permission = await requestLocationPermission();
      if (!permission) {
        return;
      }

      try {
        isTrackingRef.current = true;
        abortControllerRef.current = new AbortController();

        MapboxGL.locationManager.start();

        // Initial location update
        await trackLocation();

        // Set up periodic tracking
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(trackLocation, MIN_INTERVAL);
      } catch (error) {
        console.error('Tracking start error:', error.message);
        isTrackingRef.current = false;
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    const stopTracking = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      abortControllerRef.current?.abort();
      isTrackingRef.current = false;
      try {
        MapboxGL.locationManager.stop();
      } catch (e) {
        console.warn('Error stopping location manager:', e.message);
      }
    };

    const handleAppStateChange = nextState => {
      const oldState = appStateRef.current;

      if (oldState.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground
        startTracking();
        // Debounce queue processing
        if (queueProcessingTimeout) clearTimeout(queueProcessingTimeout);
        queueProcessingTimeout = setTimeout(() => {
          processOfflineQueue();
        }, 500);
      } else if (nextState.match(/inactive|background/)) {
        // App went to background
        if (queueProcessingTimeout) clearTimeout(queueProcessingTimeout);
        stopTracking();
      }

      appStateRef.current = nextState;
    };

    startTracking();
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      stopTracking();
      appStateSubscription?.remove();
      if (queueProcessingTimeout) clearTimeout(queueProcessingTimeout);
    };
  }, [isResponder, requestLocationPermission, trackLocation, processOfflineQueue]);

  // Process offline queue when coming online
  useEffect(() => {
    if (isOnline && isTrackingRef.current) {
      // Small debounce to batch multiple online transitions
      const timer = setTimeout(() => {
        processOfflineQueue();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, processOfflineQueue]);

  return null;
};

export default ResponderLocationTracking;
