import { SERVER_URL } from '@env';
import NetInfo from "@react-native-community/netinfo";
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from "@react-navigation/native";
import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import haversine from 'haversine-distance';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { IncidentStationMapContext } from "../context/IncidentStationMapContext";

const ReportIncident = () => {
  const [incidentType, setIncidentType] = useState('');
  const [subType, setSubType] = useState('');
  const [location, setLocation] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [media, setMedia] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [nearestStations, setNearestStations] = useState([]);
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState([]);
  const [lastReport, setLastReport] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Loading state
  const [lastLocation, setLastLocation] = useState(null);
  const [lastReadable, setLastReadable] = useState(null);
  const [addressCache, setAddressCache] = useState({});
  const [lastNetworkCheck, setLastNetworkCheck] = useState(null);
  const locationUpdateTimeoutRef = useRef(null);
  const { stationMap } = useContext(IncidentStationMapContext);
  const {t} = useTranslation();

  // Patient info for Medical Emergency
  const [isConscious, setIsConscious] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');

  const navigation = useNavigation();
  
  const incidentTypes = ['Theft', 'Accident', 'Fire', 'Medical Emergency', 'Natural Disaster', 'Others'];

  const subTypes = {
    "Medical Emergency": [
      "Vehicular Accident",
      "Asthmatic Attack",
      "Heart Attack",
      "Stroke",
      "Seizure"
    ],
    "Accident": [
      "Vehicular Collision",
      "Slip and Fall",
      "Workplace Accident",
      "Construction Accident",
      "Pedestrian Accident"
    ],
    "Fire": [
      "House Fire",
      "Wildfire",
      "Vehicle Fire",
      "Electrical Fire",
      "Chemical Fire"
    ],
    "Natural Disaster": [
      "Earthquake",
      "Flood",
      "Typhoon",
      "Landslide",
      "Volcanic Eruption"
    ],
    "Theft": [
      "Burglary",
      "Robbery",
      "Snatching",
      "Pickpocketing",
      "Vehicle Theft",
      "Shoplifting"
    ]
  };
  
  const stationKeywords = {
    // Fire / Burn / Smoke
    "fire": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "kalayo": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "sunog": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "aso": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pagsunog": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "flame": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "blaze": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "smoke": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "burn": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "ignite": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "incendio": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "flaming": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "combustion": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "charred": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "spark": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "fireball": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pyro": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "smolder": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "ash": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "conflagration": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],

    // Accidents / Collisions / Injuries
    "accident":  ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "aksidente":["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "bangga":["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "disgrasya":["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "injury": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "samad": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pilas": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "wound": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "crash": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "collision":["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "bruise": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "fracture": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "bleeding": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "cut": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],

    // Medical / Health
    "medical": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "medikal": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "sakit": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "wala sang paminsaron": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "hilanat":["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "dughan": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "faint": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "heart": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "unconscious": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "illness": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "infection": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "disease": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "stroke": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "fever": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pain": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "asthma": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "diabetes": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "vomit": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pregnancy": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "labor": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],

    // Crime / Violence / Theft
    "robbery": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "kawat": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "kawatan": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "magnanakaw": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "sudlan balay": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "krimen": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "kapintas": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "theft": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "crime": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "violence": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "assault": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "burglary": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "harrasment": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "haras": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "murder": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "kidnap": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "steal": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "armed robbery": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "pickpocket": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "vandalism": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "fight": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "shooting": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "threat": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],

    // Natural Disasters
    "flood": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "baha": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "earthquake": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "linog": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "landslide": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "lubak sang duta": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "storm": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "bagyo": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "tsunami": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "balud": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "tornado": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "typhoon": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "hail": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "flooding": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "overflow": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "eruption": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "volcano": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "mudslide": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "rescue": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
    "responder": ["BFP" , "Rescuer" , "Ambulance" , "PNP"],
  };
  
  useEffect(() => {
    setSubType('');
    setIsConscious(null);
    setPatientName('');
    setPatientAge('');
    setPatientGender('');
  }, [incidentType]);

  //token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const retrievedToken = await EncryptedStorage.getItem('token');
        if (!retrievedToken) return navigation.navigate("Login", { alert: 'Authorization token missing' });
        setToken(retrievedToken);
        const retrievedRole = await EncryptedStorage.getItem('role');
        if (!retrievedRole) return navigation.navigate("Login", { alert: 'User role missing' });
        setRole(retrievedRole);
      } catch (error) { console.log('Error fetching token:', error); }
    };
    fetchToken();
  }, [navigation]);

  //network info
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);
  
  // Check network quality - Use cache if recent check available
  const checkNetworkQuality = async () => {
    const now = Date.now();
    if (lastNetworkCheck && (now - lastNetworkCheck.timestamp) < 10000) {
      return lastNetworkCheck.result; // Reuse result from last 10 seconds
    }

    const testPing = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // Reduced from 5s

        const start = Date.now();
        const response = await fetch("https://www.google.com/generate_204", {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) return Infinity;
        return Date.now() - start;
      } catch {
        return Infinity;
      }
    };

    // Run 3 pings instead of 5 for faster check
    const samples = [];
    for (let i = 0; i < 3; i++) {
      samples.push(await testPing());
    }
    const sorted = samples.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Quick upload test - 2 attempts, need 1 success
    let successCount = 0;
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(`${SERVER_URL}/upload_test`, {
          method: "POST",
          body: JSON.stringify({ ping: "ping" }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) successCount++;
      } catch {
        console.log("Upload test failed, attempt:", i + 1);
      }
    }
    const uploadOk = successCount >= 1;

    console.log("Network quality check:", { samples, median, successCount, uploadOk });

    const result = !uploadOk 
      ? { status: "bad", latency: median }
      : median < 200 
        ? { status: "strong", latency: median }
        : median < 500 
          ? { status: "moderate", latency: median }
          : median < 1000 
            ? { status: "weak", latency: median }
            : { status: "bad", latency: median };

    setLastNetworkCheck({ timestamp: now, result });
    return result;
  };

  // Load queued reports from storage on mount
  useEffect(() => {
    const loadQueue = async () => {
      try {
        const storedQueue = await EncryptedStorage.getItem('offline_reports');
        if (storedQueue) {
          const parsed = JSON.parse(storedQueue);
          // Validate queue integrity
          const validQueue = parsed.filter(item => 
            item && item.incidentType && item.location && item.station_ids
          );
          if (validQueue.length !== parsed.length) {
            console.warn(`Removed ${parsed.length - validQueue.length} corrupted queue items`);
            await EncryptedStorage.setItem('offline_reports', JSON.stringify(validQueue));
          }
          setQueue(validQueue);
          console.log('Loaded offline reports queue:', validQueue.length, 'items');
        }
      } catch (err) {
        console.error('Failed to load queue:', err);
        // Clear corrupted queue
        await EncryptedStorage.removeItem('offline_reports');
        setQueue([]);
      }
    };
    loadQueue();
  }, []);

  // Auto-submit queued reports when back online
  useEffect(() => {
    if (isOnline) processOfflineQueue();
  }, [isOnline]);

  // Periodic retry for queued reports (every 5 minutes if online)
  useEffect(() => {
    if (!isOnline || queue.length === 0) return;

    const retryInterval = setInterval(() => {
      console.log('Periodic retry check for queued reports...');
      processOfflineQueue();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(retryInterval);
  }, [isOnline, queue.length]);
  // for live clock 
  useEffect(() => {
    const timer = setInterval(() => {
      setIncidentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);
  //format time
  const formatDateTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };
  //formate date
  const formatSMSDateTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour12: true,
    });
  };
  //nearby stations
  const fetchStationsByType = useCallback(() => {
    if (!incidentType.trim()) return [];

    const stations = stationMap[incidentType] || [];

    // Return all stations directly (no distance filtering)
    return stations.map(s => ({
      ...s,
      distance: haversine(
        { lat: selectedLocation?.latitude || 0, lon: selectedLocation?.longitude || 0 },
        { lat: parseFloat(s.latitude), lon: parseFloat(s.longitude) }
      )
    }));
  }, [incidentType, stationMap, selectedLocation]);
 //fetch stations bt type
  useEffect(() => {
    const allStations = fetchStationsByType();
    setNearestStations(allStations);
    console.log("All stations by type:", JSON.stringify(allStations , null , 2 ));
  }, [fetchStationsByType]);
  //detect stations by description
  const detectStationTypesFromDescription = (text) => {
    const lower = text.toLowerCase();
    const matchedTypes = new Set();

    for (const [word, types] of Object.entries(stationKeywords)) {
      if (lower.includes(word)) {
        types.forEach(type => matchedTypes.add(type));
      }
    }

    return Array.from(matchedTypes);
  };
  const assignStationsFromDescription = (description, nearestStations) => {
    const detectedTypes = detectStationTypesFromDescription(description);
    if (!detectedTypes.length || !Array.isArray(nearestStations)) return [];
    
    // Include all stations whose type matches detected types
    const matchedStations = nearestStations.filter(s =>
      detectedTypes.includes(s.type)
    );
  
    // Return all matched station IDs
    return matchedStations.map(s => s.id);
  };
  
  //console.log("Incident time:", incidentTime);
  const processOfflineQueue = async () => {
    if (!queue.length) {
      console.log('Queue is empty');
      return;
    }

    console.log(`Processing ${queue.length} queued reports...`);
    
    const failedReports = [];
    const successfulReports = [];
    let processedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const reportData = queue[i];
      
      // Skip if exceeded max retry attempts (10)
      if (reportData.attempts && reportData.attempts >= 10) {
        console.warn(`Report ${reportData.id || i} exceeded max retry attempts`);
        failedReports.push(reportData);
        continue;
      }

      // Check network connectivity
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected && netState.isInternetReachable;

      if (!isConnected) {
        console.log('No network connectivity. Keeping reports in queue.');
        failedReports.push(...queue.slice(i)); // Keep remaining reports
        break;
      }

      try {
        // Build form data
        const formData = new FormData();
        formData.append('incidentType', reportData.incidentType);
        formData.append('subType', reportData.subType || '');
        formData.append('incidentDescription', reportData.incidentDescription || '');
        formData.append('incidentTime', reportData.formatDateTime ? reportData.formatDateTime(reportData.incidentTime) : formatDateTime(reportData.incidentTime));
        formData.append('processed_location', reportData.processed_location || reportData.location);
        formData.append('location', reportData.location);
        formData.append('station_ids', (reportData.station_ids || []).join(','));

        // Safely append media files
        if (Array.isArray(reportData.media)) {
          reportData.media
            .filter(uri => typeof uri === 'string' && uri.length > 0)
            .forEach((uri, idx) => {
              try {
                const localUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                formData.append('media', {
                  uri: localUri,
                  name: `media_${idx}_${Date.now()}.webp`,
                  type: 'image/webp',
                });
              } catch (mediaErr) {
                console.warn(`Failed to append media ${idx}:`, mediaErr);
              }
            });
        }

        // Medical Emergency fields
        if (reportData.incidentType === 'Medical Emergency') {
          formData.append('isConscious', reportData.isConscious ? 'true' : 'false');
          formData.append('patientName', reportData.patientName || '');
          formData.append('patientAge', reportData.patientAge || '');
          formData.append('patientGender', reportData.patientGender || '');
        }

        console.log(`Submitting queued report (${i + 1}/${queue.length}):`, reportData.id);

        const response = await axios.post(`${SERVER_URL}/report_incident`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
          timeout: 20000,
        });

        // Success
        console.log(`✓ Report ${reportData.id} submitted successfully`);
        successfulReports.push(reportData.id);
        processedCount++;

      } catch (err) {
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        const statusCode = err.response?.status;

        // Categorize errors
        const isRetryable = !statusCode || statusCode >= 500 || statusCode === 408 || statusCode === 429;
        
        const updatedReport = {
          ...reportData,
          attempts: (reportData.attempts || 0) + 1,
          lastAttemptTime: Date.now(),
          lastError: errorMsg,
        };

        if (isRetryable) {
          console.warn(`✗ Report ${reportData.id} failed (retryable):`, errorMsg);
          failedReports.push(updatedReport);
        } else if (statusCode === 409) {
          // Duplicate - don't retry
          console.warn(`✗ Report ${reportData.id} is a duplicate. Removing from queue.`);
        } else {
          console.error(`✗ Report ${reportData.id} failed (non-retryable):`, errorMsg);
          failedReports.push(updatedReport);
        }
      }
    }

    // Update queue with failed reports
    const finalQueue = failedReports.map(r => {
      const attempt = r.attempts || 0;
      // Add exponential backoff: 2^attempt * 1000ms
      const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 3600000); // Max 1 hour
      return { ...r, nextRetryTime: Date.now() + backoffMs };
    });

    setQueue(finalQueue);

    if (finalQueue.length > 0) {
      await EncryptedStorage.setItem('offline_reports', JSON.stringify(finalQueue));
    } else {
      await EncryptedStorage.removeItem('offline_reports');
    }

    // Show summary
    const summary = `${successfulReports.length} submitted, ${finalQueue.length} pending`;
    console.log(`Queue processing complete: ${summary}`);
    
    if (successfulReports.length > 0) {
      Alert.alert('Reports Submitted', `${successfulReports.length} report(s) successfully uploaded.`);
    }
    
    if (finalQueue.length > 0) {
      const oldestRetry = finalQueue[0].nextRetryTime;
      const waitMinutes = Math.ceil((oldestRetry - Date.now()) / 60000);
      if (waitMinutes > 0) {
        console.log(`Next retry in ${waitMinutes} minute(s)`);
      }
    }
  };

  //location
  useEffect(() => { requestLocationPermission(); }, []);
  // Load saved location when screen opens
  useEffect(() => {
    const loadSavedLocation = async () => {
      try {
        const saved = await EncryptedStorage.getItem("lastLocationData");
        if (saved) {
          const parsed = JSON.parse(saved);
          setSelectedLocation({ latitude: parsed.latitude, longitude: parsed.longitude });
          setLocation(parsed.readable || `${parsed.latitude.toFixed(6)}, ${parsed.longitude.toFixed(6)}`);
          setLastLocation({ latitude: parsed.latitude, longitude: parsed.longitude });
          setLastReadable(parsed.readable);
        }
        console.log("Loaded saved location:", saved ? JSON.parse(saved) : "none");
      } catch (err) {
        console.log("Failed to load saved location:", err);
      }
    };

    loadSavedLocation();
  }, []);

  useEffect(() => {
    if (!locationPermissionGranted) return;
    let subscription;

    const watchLocation = async () => {
      // 1. Check if last known location exists to show something IMMEDIATELY while watching starts
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && !selectedLocation) {
         const { latitude, longitude } = lastKnown.coords;
         const initialStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
         setLocation(initialStr); 
         setSelectedLocation({ latitude, longitude });
      }

      // 2. Start Watching
      subscription = await Location.watchPositionAsync(
        { 
          accuracy: Location.Accuracy.BestForNavigation, // 'Balanced' is faster than 'High' and usually sufficient for addresses
          distanceInterval: 10, // Update every 10 meters
          timeInterval: 5000 
        },
        async (loc) => {
          const lat = loc.coords.latitude;
          const lon = loc.coords.longitude;
          const newPoint = { latitude: lat, longitude: lon };
          const coordString = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

          // STEP A: FAST UPDATE
          // Update the UI with coordinates IMMEDIATELY. Do not wait for the address.
          // Only update if we haven't manually locked a readable address yet (optional check)
          setSelectedLocation(newPoint);
          setLastLocation(newPoint);
          
          // Show coordinates right away so the input isn't empty
          // We set a flag or check if the current text is just coordinates to avoid overwriting user edits
          setLocation((prev) => {
             // If the user hasn't typed a custom description, show the coords
             // Or if the previous value was also just coords/empty
             return coordString; 
          });

          // STEP B: SLOW UPDATE (Background Geocoding)
          // Debounce the API call to save data/battery
          if (locationUpdateTimeoutRef.current) {
            clearTimeout(locationUpdateTimeoutRef.current);
          }

          locationUpdateTimeoutRef.current = setTimeout(async () => {
            if (!isOnline) return; // Keep the coordinates if offline

            // Check cache first to avoid API call
            const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            if (addressCache[coordKey]) {
                setLocation(addressCache[coordKey]);
                setLastReadable(addressCache[coordKey]);
                return;
            }

            // Fetch Address
            const readable = await convertToReadableLocation(lat, lon);
            
            // Update UI with the nice address
            if (readable && readable !== "Unnamed Road") {
                setLocation(readable);
                setLastReadable(readable);
                
                // Save to cache
                setAddressCache(prev => ({ ...prev, [coordKey]: readable }));
                
                // Persist specific data
                await EncryptedStorage.setItem(
                  "lastLocationData",
                  JSON.stringify({
                    latitude: lat,
                    longitude: lon,
                    readable: readable,
                    timestamp: Date.now(),
                  })
                );
            }
          }, 800); // Wait 800ms after movement stops before geocoding
        }
      );
    };

    watchLocation();
    return () => { 
      if (subscription) subscription.remove();
      if (locationUpdateTimeoutRef.current) clearTimeout(locationUpdateTimeoutRef.current);
    };
  }, [locationPermissionGranted, isOnline]);

  const requestLocationPermission = async () => {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();

      if (status === 'granted') {
        setLocationPermissionGranted(true);
        setShowPermissionPrompt(false);
        return true;
      }

      if (status === 'denied' && canAskAgain) {
        const { status: requestStatus } = await Location.requestForegroundPermissionsAsync();
        if (requestStatus === 'granted') {
          setLocationPermissionGranted(true);
          setShowPermissionPrompt(false);
          return true;
        }
      }

      setLocationPermissionGranted(false);
      setShowPermissionPrompt(true);

      if (!canAskAgain) {
        Alert.alert(
          t('enableperset'),
          'Please enable location permission in settings to continue.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }

      return false;
    } catch (err) {
      setLocationPermissionGranted(false);
      setShowPermissionPrompt(true);
      Alert.alert('Error requesting location permission', err.message);
      return false;
    }
  };

  //console.log("Readable Location:", location);
  const convertToReadableLocation = async (latitude, longitude) => {
    try {
        // Reduced timeout to 1.5s - if it takes longer, just show coords
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));
        
        const result = await Promise.race([
            Location.reverseGeocodeAsync({ latitude, longitude }),
            timeout
        ]);

        if (!result || result.length === 0) return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        const addr = result[0];
        
        // Construct address - simplified for speed
        let parts = [];
        if (addr.street) parts.push(addr.street);
        if (addr.name && addr.name !== addr.street && addr.name !== "Unnamed Road") parts.push(addr.name);
        if (addr.district || addr.city) parts.push(addr.district || addr.city);
        if (addr.region) parts.push(addr.region);

        const readable = parts.length > 0 ? parts.join(", ") : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        return readable;

    } catch (error) {
        // On error or timeout, silently return coordinates
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  const saveToQueue = async (reportData) => {
    // Validate report data structure
    if (!reportData.incidentType || !reportData.location || !Array.isArray(reportData.station_ids)) {
      console.error('Invalid report data structure:', reportData);
      Alert.alert('Error', 'Invalid report data. Cannot queue.');
      return false;
    }

    try {
      const enrichedReport = {
        ...reportData,
        queuedAt: Date.now(),
        attempts: 0, // Track submission attempts
        lastAttemptTime: null,
        lastError: null,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique queue ID
      };

      const updatedQueue = [...queue, enrichedReport];
      setQueue(updatedQueue);
      await EncryptedStorage.setItem('offline_reports', JSON.stringify(updatedQueue));
      
      console.log('Report queued successfully. Queue size:', updatedQueue.length);
      return true;
    } catch (err) {
      console.error('Failed to save report to queue:', err);
      Alert.alert('Error', 'Failed to queue report. Please try again.');
      return false;
    }
  };
  const requestSMSPermission = async () => {
    try {
      const currentStatus = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.SEND_SMS
      );

      if (currentStatus) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'SMS Permission',
          message: 'This app needs permission to send SMS reports to emergency stations.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny'
        }
      );

      if (granted === PermissionsAndroid.RESULTS.GRANTED) return true;

      if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Alert.alert(
          'Permission required',
          'Please enable SMS permission from settings to send emergency reports.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }

      return false;
    } catch (err) {
      console.log('SMS permission error:', err);
      return false;
    }
  };
  //sms reporting

  const sendSMSReport = async (reportData) => {
    console.log("sendSMSReport called with:", { reportData, nearestStations });

    if (!reportData.station_ids?.length) return;

    const hasPermission = await requestSMSPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', t('messpermission'));
      return;
    }

    const recipients = nearestStations
      .filter(s => reportData.station_ids.includes(s.id))
      .map(s => s.contact)
      .slice(0, 3); // pick up to 3 numbers

    if (!recipients.length) {
      Alert.alert(t('nostationsms'));
      return;
    }

    let mapLink = '';

    if (reportData.location && reportData.location.includes(',')) {
      const [lat, lon] = reportData.location.split(',').map(p => p.trim());
      if (lat && lon) {
        mapLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      }
    }

    if (!mapLink) {
      mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        reportData.processed_location
      )}`;
    }

    const message = `
  Type of Incident: ${reportData.incidentType}
  ${reportData.subType ? `Sub-type: ${reportData.subType}` : ''}
  Description: ${reportData.incidentDescription}
  Location: ${reportData.processed_location}
  Map Link: ${mapLink}
  Date/Time: ${formatSMSDateTime(reportData.incidentTime)}
  This message generated by UIRS System.
  `.trim();

    const smsUrl =
      Platform.OS === 'android'
        ? `sms:${recipients.join(',')}?body=${encodeURIComponent(message)}`
        : `sms:${recipients.join(',')}&body=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(smsUrl);
    } catch (err) {
      console.log("Failed to open SMS app:", err);
      Alert.alert('Error', t('smserror'));
    }
  };

  // Retry all queued reports manually
  const retryQueuedReports = async () => {
    if (queue.length === 0) {
      Alert.alert('No queued reports', 'All reports have been submitted.');
      return;
    }

    Alert.alert(
      'Retry Queue',
      `Attempt to submit ${queue.length} queued report(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: async () => {
            await processOfflineQueue();
          }
        }
      ]
    );
  };
  //report incident
  const submitReport = async (reportData, showAlert = true, resetFields = true, isOnline) => {
    setIsSubmitting(true);

    try {
      // Check if we can submit online
      let canSubmitOnline = isOnline;
      if (isOnline) {
        const networkQuality = await checkNetworkQuality();
        canSubmitOnline = ['strong', 'moderate', 'weak'].includes(networkQuality.status);
        console.log("Network quality check:", networkQuality);
      }

      if (canSubmitOnline) {
        // Attempt online submission
        try {
          const formData = new FormData();
          formData.append('incidentType', reportData.incidentType);
          formData.append('subType', reportData.subType);
          formData.append('incidentDescription', reportData.incidentDescription);
          formData.append('incidentTime', formatDateTime(reportData.incidentTime));
          formData.append('location', reportData.location);
          formData.append('processed_location', reportData.processed_location);
          formData.append('station_ids', reportData.station_ids.join(','));
          
          // Append media safely
          if (Array.isArray(reportData.media)) {
            reportData.media.forEach((item, i) => {
              try {
                formData.append('media', {
                  uri: item.uri || item,
                  name: item.name || `media_${i}_${Date.now()}.webp`,
                  type: item.type || 'image/webp'
                });
              } catch (mediaErr) {
                console.warn(`Failed to append media ${i}:`, mediaErr);
              }
            });
          }

          if (reportData.incidentType === 'Medical Emergency') {
            formData.append('isConscious', reportData.isConscious ? 'true' : 'false');
            formData.append('patientName', reportData.patientName || '');
            formData.append('patientAge', reportData.patientAge || '');
            formData.append('patientGender', reportData.patientGender || '');
          }

          console.log('Submitting report:', reportData.incidentType);

          await axios.post(`${SERVER_URL}/report_incident`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              Authorization: `Bearer ${token}`
            },
            timeout: 20000,
          });

          // Success
          if (showAlert) {
            Alert.alert(
              "Success", t('successrep'),
              [
                {
                  text: "Home",
                  onPress: () => {
                    if (role === "admin") {
                      navigation.navigate("AdminDashboard");
                    } else if (role === "responder_personnel" || role === "responder_head") {
                      navigation.navigate("ResponderDashboard");
                    } else {
                      navigation.navigate("UserHome");
                    }
                  },
                },
                { text: "Ok" },
              ],
              { cancelable: false }
            );
          }

          if (resetFields) {
            setIncidentType('');
            setIncidentDescription('');
            setMedia([]);
            setSubType('');
            setIsConscious(null);
            setPatientName('');
            setPatientAge('');
            setPatientGender('');
          }

          return;
        } catch (err) {
          console.error('Online submission failed:', err.message);
          
          // Handle specific errors
          if (err.response?.status === 409) {
            Alert.alert("Duplicate Report", t('duplicatealert'));
            if (resetFields) {
              setIncidentType('');
              setIncidentDescription('');
              setMedia([]);
              setSubType('');
              setIsConscious(null);
              setPatientName('');
              setPatientAge('');
              setPatientGender('');
            }
            setIsSubmitting(false);
            return;
          }

          // For other errors, try queueing instead
          console.log('Will queue report due to submission error');
        }
      }

      // Offline or failed online submission - queue the report
      const queued = await saveToQueue(reportData);
      
      if (queued) {
        Alert.alert(
          "Offline",
          t('offlinequeue'),
        );
        
        // If offline, also try SMS
        if (!isOnline) {
          console.log('Attempting SMS fallback...');
          sendSMSReport(reportData);
        }
        
        setLastReport(reportData);

        if (resetFields) {
          setIncidentType('');
          setIncidentDescription('');
          setMedia([]);
          setSubType('');
          setIsConscious(null);
          setPatientName('');
          setPatientAge('');
          setPatientGender('');
        }
      }

    } catch (err) {
      console.error('Report submission error:', err);
      Alert.alert("Error", t('submiterror'));
    } finally {
      setIsSubmitting(false);
    }
  };
  //duplicate incident
  const checkDuplicateIncident = async (reportData) => {
    try {
      // Skip duplicate check for "Other" incidents
      if (reportData.incidentType === "Others") return false;

      const response = await axios.post(
        `${SERVER_URL}/check_duplicate_incident`,
        {
          incidentType: reportData.incidentType,
          subType: reportData.subType,
          location: reportData.location,
          incidentDescription: reportData.incidentDescription
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        }
      );

      return response.data.duplicate;
    } catch (err) {
      console.log(t('errorchecking'));
      return false;
    }
  };
  const handleReportSubmission = async () => {
    const reportData = {
      incidentType,
      subType,
      incidentDescription,
      incidentTime,
      location: selectedLocation ? `${selectedLocation.latitude},${selectedLocation.longitude}` : location,
      processed_location: location,
      station_ids:
        incidentType.toLowerCase() === "others"
          ? assignStationsFromDescription(incidentDescription, nearestStations)
          : nearestStations.map(st => st.id),
      media: media ,
      isConscious,
      patientName,
      patientAge,
      patientGender
    };

    const isDuplicate = await checkDuplicateIncident(reportData);
    if (isDuplicate) {
      Alert.alert(
        "Possible Duplicate Report" , t('duplicateincident'),
        [
          { text: t('no'), style: t('cancel') },
          { text: t('yes'), onPress: () => submitReport(reportData, true, true, isOnline) }
        ]
      );
    } else {
      submitReport(reportData, true, true, isOnline);
    }
  };
  // Auto-submit on media/incidentType change
  useEffect(() => {
    if (!incidentType || media.length === 0) return;
    // Skip subType check when incident type is "Other"
    if (incidentType !== "Others" && !subType) return;
    handleReportSubmission();
  }, [media, incidentType, subType, isConscious, patientName, patientAge, patientGender]);

  //compress image and save as webp
  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
      );

      // Force the filename to have .webp extension
      const filename = result.uri.split('/').pop().replace(/\.\w+$/, '.webp');
      return { uri: result.uri, name: filename, type: 'image/webp' };
    } catch (err) {
      console.log("Image compression error:", err);
      return { uri, name: uri.split('/').pop(), type: 'image/jpeg' };
    }
  };
  const openCamera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return Alert.alert(t('campermission'));

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      aspect: [4, 3],
      quality: 1
    });

    if (!result.canceled && result.assets?.length > 0) {
      const compressed = await compressImage(result.assets[0].uri);
      setMedia(prev => [...prev, compressed]);
    }
  };
  const pickMedia = async () => {
    if (!incidentType.trim()) {
      return Alert.alert('Error', t('errorincident'));
    }

    if (!location.trim()) {
      return Alert.alert('Error', t('waitloc'));
    }

    if (incidentType !== 'Others' && !subType.trim()) {
      return Alert.alert('Error', t('selectsubtype'));
    }

    const trimmedDesc = incidentDescription.trim();

    if (incidentType === "Others") {
      if (!trimmedDesc) {
        return Alert.alert("Missing Description", t('missingdesc'));
      }

      const lowerDesc = trimmedDesc.toLowerCase();
      const matchedKeywords = Object.keys(stationKeywords).filter(word => lowerDesc.includes(word));

      if (!matchedKeywords.length) {
        return Alert.alert(
           "No Keywords Found", t('nokeywords')
        );
      }
    }

    openCamera();
  };
  const removeMedia = (index) => setMedia(prev => prev.filter((_, i) => i !== index));
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    // 1. Reset Form Fields Immediately (Makes the UI feel responsive)
    setIncidentType('');
    setIncidentDescription('');
    setMedia([]);
    setSubType('');
    setIsConscious(null);
    setPatientName('');
    setPatientAge('');
    setPatientGender('');

    // 2. Handle Location Speed Optimization
    if (selectedLocation) {
      // STEP A: Show Coordinates IMMEDIATELY (Don't wait for API)
      const coordString = `${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}`;
      setLocation(coordString);

      // STEP B: Fetch Readable Address (If online)
      if (isOnline) {
        try {
          // We await this so the spinner stays until address is ready, 
          // but the user already sees the coordinates from Step A.
          const readable = await convertToReadableLocation(
            selectedLocation.latitude,
            selectedLocation.longitude
          );
          
          // Update UI with the readable address
          setLocation(readable);
          setLastReadable(readable);

          // Save to storage in background (Fire and forget, don't await)
          EncryptedStorage.setItem(
            "lastLocationData",
            JSON.stringify({
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude,
              readable,
              timestamp: Date.now(),
            })
          ).catch(err => console.log("Storage save error:", err));

        } catch (error) {
          console.log("Refresh geocode failed, keeping coordinates visible");
        }
      }
    }

    // 3. Process background tasks
    setNearestStations(fetchStationsByType()); // This might return empty since we cleared incidentType, which is expected on refresh
    processOfflineQueue();

    setRefreshing(false);
  }, [selectedLocation, isOnline, fetchStationsByType]);
  
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.header}>{t('reportincident')}</Text>

        {/* Queue Status Indicator */}
        {queue.length > 0 && (
          <View style={{ backgroundColor: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#ff9800' }}>
            <Text style={{ color: '#856404', fontWeight: 'bold', marginBottom: 4 }}>
              ⚠️ {queue.length} report(s) waiting to submit
            </Text>
            <TouchableOpacity onPress={retryQueuedReports}>
              <Text style={{ color: '#0066cc', textDecorationLine: 'underline', marginTop: 4 }}>
                Tap to retry now
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {showPermissionPrompt ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>{t('locationpermission')}</Text>
            <TouchableOpacity style={[styles.pickMediaButton, { backgroundColor: '#f00' }]} onPress={requestLocationPermission}>
              <Text style={styles.buttonText}>{t('tryagain')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {selectedLocation && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.coordinates}>GPS for Location Tracking      [Internet Status]</Text>
                <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? 'green' : 'red'} style={{ marginLeft: 8 }} />
              </View>
            )}

            <TextInput style={styles.input} placeholder="Location" value={location} editable={false} />

            <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('incidenttype')}</Text>
            <View style={[styles.pickerContainer, { marginBottom: 12, backgroundColor: '#fff' }]}>
              <Picker
                selectedValue={incidentType}
                onValueChange={(v) => setIncidentType(v)}
                style={{ color: '#000', backgroundColor: '#fff' }} // text black, background white
                dropdownIconColor="#000" // icon black
              >
                <Picker.Item label={t('selectincidenttype')} value="" />
                {incidentTypes.map((type, i) => (
                  <Picker.Item key={i} label={type} value={type} />
                ))}
              </Picker>
            </View>
              

            {/* Show sub-type only if type is not Other */}
            {incidentType && incidentType !== "Others" && subTypes[incidentType] && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('subtyperequiredtittle')}{incidentType}</Text>
                <View style={[styles.pickerContainer, { marginBottom: 12, backgroundColor: '#fff' }]}>
                  <Picker
                    selectedValue={subType}
                    onValueChange={(v) => setSubType(v)}
                    enabled={incidentType !== "Others"} // disable when main type is Other
                    style={{ color: '#000', backgroundColor: '#fff' }} // text black, background white
                    dropdownIconColor="#000" // icon black
                  >
                    <Picker.Item label={`${t('subtyperequired')} ${incidentType}`} value="" />
                    {subTypes[incidentType].map((t, idx) => (
                      <Picker.Item key={idx} label={t} value={t} />
                    ))}
                  </Picker>
                </View>
                  
              </>
            )}

            {incidentType === "Medical Emergency" && subType && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('iscon')}</Text>
                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginRight: 6, backgroundColor: isConscious === true ? 'green' : '#007BFF' }]}
                    onPress={() => setIsConscious(true)}
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginLeft: 6, backgroundColor: isConscious === false ? 'red' : '#007BFF' }]}
                    onPress={() => setIsConscious(false)}
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>{t('no')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            
            {incidentType === "Medical Emergency" && isConscious && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>Patient Information</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder={t('patientname')} 
                  placeholderTextColor="#888"
                  value={patientName} 
                  onChangeText={setPatientName} 
                />
                <TextInput 
                  style={styles.input} 
                  placeholder={t('patientage')} 
                  placeholderTextColor="#888"
                  value={patientAge} 
                  onChangeText={setPatientAge} 
                  keyboardType="numeric" 
                />
                <View style={[styles.pickerContainer, { marginBottom: 12, backgroundColor: '#fff' }]}>
                  <Picker
                    selectedValue={patientGender}
                    onValueChange={(v) => setPatientGender(v)}
                    style={{ color: '#000', backgroundColor: '#fff' }}
                    dropdownIconColor="#000"
                  >
                    <Picker.Item label={t('selectgender')} value="" />
                    <Picker.Item label={t('male')} value="Male" />
                    <Picker.Item label={t('female')} value="Female" />
                  </Picker>
                </View>
              </>
            )}
            
            {incidentType === "Others" && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('describe')}</Text>
                <TextInput
                  style={[styles.input, { color: '#000', backgroundColor: '#fff' }]}
                  placeholder={t('descEx')}
                  placeholderTextColor="#888"
                  value={incidentDescription}
                  onChangeText={setIncidentDescription}
                  multiline
                />
              </>
            )}
            

            <TextInput style={styles.input} placeholder={t('time')} placeholderTextColor={'#888'} value={incidentTime ? formatDateTime(incidentTime) : ""} editable={false} />

            <ScrollView horizontal>
              {media.map((file, index) => (
                <View key={index} style={{ position: 'relative', marginRight: 10 }}>
                  <Image source={{ uri: file.uri }} style={styles.mediaPreview} />
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeMedia(index)}>
                    <Text style={styles.removeButtonText}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.pickMediaButton, styles.buttonContainer]} onPress={pickMedia}>
              <Text style={styles.buttonText}>{t('opencam')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <Modal visible={isSubmitting} transparent animationType="fade">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000055' }}>
          <View style={{ padding: 20, backgroundColor: '#fff', borderRadius: 10, flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#007BFF" />
            <Text style={{ marginLeft: 15, fontSize: 16 }}>Submitting Report...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#fff', flex: 1 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', marginTop: 30 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 12 , backgroundColor: '#fff', color: '#000' },
  mediaPreview: { width: 100, height: 100, borderRadius: 8 },
  coordinates: { fontSize: 14, color: '#555' },
  removeButton: { position: 'absolute', top: 0, right: 0, backgroundColor: 'red', borderRadius: 50, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  removeButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', color:'black' },
  pickMediaButton: { borderRadius: 15, backgroundColor: '#007BFF', padding: 12, alignItems: 'center' },
  buttonContainer: { marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  permissionBox: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#f00' },
  permissionText: { color: '#f00', fontWeight: 'bold', marginBottom: 8 }
});

export default ReportIncident;
