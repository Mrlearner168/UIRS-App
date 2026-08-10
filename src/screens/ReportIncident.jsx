import { SERVER_URL } from '@env';
import NetInfo from "@react-native-community/netinfo";
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from "@react-navigation/native";
import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  RefreshControl,
  Platform as RNPlatform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import queueService from "../services/queueService";

// Structured Production Logger (replaces console.log)
const Logger = {
  info: (msg, meta = {}) => { if (__DEV__) console.info(`[INFO] ${msg}`, meta); },
  warn: (msg, meta = {}) => { if (__DEV__) console.warn(`[WARN] ${msg}`, meta); },
  error: (msg, err = null) => {
    // In production, send to Sentry/Crashlytics. Never expose PII or tokens.
    if (__DEV__) console.error(`[ERROR] ${msg}`, err?.message || err);
  }
};

const generateUUID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

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
  const [refreshing, setRefreshing] = useState(false);
  
  // Progress & Locks
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [progressStep, setProgressStep] = useState(null);
  const [showManualSubmitButton, setShowManualSubmitButton] = useState(false);
  
  // Caching & Queue
  const [addressCache, setAddressCache] = useState({});
  const [queue, setQueue] = useState([]);
  
  // Searchable Subtype Modal State
  const [isSubtypeModalVisible, setIsSubtypeModalVisible] = useState(false);
  const [subtypeSearchQuery, setSubtypeSearchQuery] = useState('');

  // Patient info for Medical Emergency
  const [isConscious, setIsConscious] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');

  // Concurrency Locks (useRef) - Thread-safe equivalents for React Native
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const isQueueProcessingRef = useRef(false);
  const isCameraLaunchingRef = useRef(false);
  const locationUpdateTimeoutRef = useRef(null);
  const autoSubmitFallbackRef = useRef(null);

  const { t } = useTranslation();
  const navigation = useNavigation();

  // --- Static Data ---
  const incidentTypes = useMemo(() => [
    'Accident', 'Crime', 'Fire', 'Hazardous Materials', 
    'Medical Emergency', 'Natural Disaster', 'Rescue', 'Others'
  ], []);
  
  const subTypes = useMemo(() => ({
    "Medical Emergency": ["Cardiac Arrest", "Heart Attack", "Stroke", "Seizure", "Asthmatic Attack", "Breathing Difficulty", "Unconscious Person", "Diabetic Emergency", "Severe Allergic Reaction", "Poisoning", "Drug Overdose", "Severe Bleeding", "Head Injury", "Fracture", "Burn Injury", "Electrocution", "Heat Stroke", "Hypothermia", "Drowning", "Near Drowning", "Choking", "Pregnancy Emergency", "Labor and Delivery", "Mental Health Crisis", "Suicide Attempt", "Multiple Casualties"],
    "Accident": ["Motorcycle Collision", "Car Collision", "Truck Collision", "Bus Collision", "Multi-Vehicle Collision", "Pedestrian Hit", "Hit and Run", "Vehicle Rollover", "Vehicle Fell into Ravine", "Bicycle Accident", "Slip and Fall", "Workplace Accident", "Construction Accident", "Industrial Accident", "Machinery Accident", "Crush Injury", "Falling Object Incident", "Building Collapse", "Elevator Accident", "Escalator Accident", "Electrical Accident", "Gas Explosion", "Chemical Spill Exposure", "Drowning Accident"],
    "Fire": ["House Fire", "Apartment Fire", "Building Fire", "Commercial Establishment Fire", "Warehouse Fire", "Factory Fire", "Vehicle Fire", "Bus Fire", "Truck Fire", "Motorcycle Fire", "Electrical Fire", "Kitchen Fire", "Gas Leak Fire", "Chemical Fire", "Forest Fire", "Grass Fire", "Wildfire", "Landfill Fire", "Transformer Fire", "Explosion with Fire"],
    "Natural Disaster": ["Earthquake", "Aftershock", "Flood", "Flash Flood", "Typhoon", "Tropical Storm", "Storm Surge", "Landslide", "Mudslide", "Volcanic Eruption", "Ashfall", "Tsunami", "Sinkhole", "Drought", "Extreme Heat", "Strong Winds", "Lightning Strike"],
    "Crime": ["Robbery", "Burglary", "Pickpocketing", "Snatching", "Vehicle Theft", "Motorcycle Theft", "Shoplifting", "Armed Robbery", "Home Invasion", "Assault", "Physical Injury", "Stabbing", "Shooting Incident", "Domestic Violence", "Child Abuse", "Kidnapping", "Hostage Situation", "Sexual Assault", "Homicide", "Attempted Homicide", "Vandalism", "Public Disturbance"],
    "Rescue": ["Water Rescue", "Mountain Rescue", "Confined Space Rescue", "High Angle Rescue", "Building Collapse Rescue", "Vehicle Entrapment", "Missing Person", "Lost Hiker", "Animal Rescue", "Swift Water Rescue", "Trench Rescue", "Elevator Rescue"],
    "Hazardous Materials": ["Chemical Spill", "Gas Leak", "Radiation Hazard", "Toxic Exposure", "Hazardous Waste Incident", "Industrial Chemical Release", "Fuel Spill", "Biological Hazard"],
    "Others": ["Suspicious Package", "Bomb Threat", "Power Outage", "Water Supply Disruption", "Communication Failure", "Public Safety Concern", "Crowd Control Incident", "Animal Attack", "Unknown Emergency"]
  }), []);

  // --- Cleanup on Unmount ---
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (locationUpdateTimeoutRef.current) clearTimeout(locationUpdateTimeoutRef.current);
      if (autoSubmitFallbackRef.current) clearTimeout(autoSubmitFallbackRef.current);
    };
  }, []);

  // --- Draft Recovery & Auto-Save ---
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftStr = await EncryptedStorage.getItem('incident_draft');
        if (draftStr && isMountedRef.current) {
          const draft = JSON.parse(draftStr);
          if (draft.incidentType) setIncidentType(draft.incidentType);
          if (draft.subType) setSubType(draft.subType);
          if (draft.incidentDescription) setIncidentDescription(draft.incidentDescription);
          if (draft.patientName) setPatientName(draft.patientName);
          if (draft.patientAge) setPatientAge(draft.patientAge);
          if (draft.patientGender) setPatientGender(draft.patientGender);
          if (draft.isConscious !== undefined) setIsConscious(draft.isConscious);
          Logger.info('Draft recovered successfully');
        }
      } catch (err) { Logger.error('Failed to load draft', err); }
    };
    loadDraft();
  }, []);

  useEffect(() => {
    const saveDraft = async () => {
      try {
        const draft = { incidentType, subType, incidentDescription, patientName, patientAge, patientGender, isConscious };
        await EncryptedStorage.setItem('incident_draft', JSON.stringify(draft));
      } catch (err) { Logger.warn('Failed to save draft', err); }
    };
    const timer = setTimeout(saveDraft, 1000); // Debounce draft saving
    return () => clearTimeout(timer);
  }, [incidentType, subType, incidentDescription, patientName, patientAge, patientGender, isConscious]);

  // --- State Reset ---
  const resetFormFields = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIncidentType('');
    setIncidentDescription('');
    setMedia([]);
    setSubType('');
    setIsConscious(null);
    setPatientName('');
    setPatientAge('');
    setPatientGender('');
    setShowManualSubmitButton(false);
    setProgressStep(null);
    if (autoSubmitFallbackRef.current) clearTimeout(autoSubmitFallbackRef.current);
    
    try {
        await EncryptedStorage.removeItem('incident_draft');
    } catch (err) { Logger.warn('Failed to clear draft', err); }
  }, []);

  // --- Authentication & Network ---
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const retrievedToken = await EncryptedStorage.getItem('token');
        if (!retrievedToken) return navigation.navigate("Login", { alert: 'Authorization token missing' });
        if (isMountedRef.current) setToken(retrievedToken);
        
        const retrievedRole = await EncryptedStorage.getItem('role');
        if (!retrievedRole) return navigation.navigate("Login", { alert: 'User role missing' });
        if (isMountedRef.current) setRole(retrievedRole);
      } catch (err) { Logger.error('Error fetching auth data', err); }
    };
    fetchToken();
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (isMountedRef.current) setIsOnline(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // --- Time Management ---
  useEffect(() => {
    const timer = setInterval(() => {
      if (isMountedRef.current) setIncidentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTime = useCallback((date) => {
    return date ? new Date(date).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }) : "";
  }, []);

  // --- GPS Tracking (High Accuracy) ---
  useEffect(() => { requestLocationPermission(); }, []);

  const convertToReadableLocation = async (latitude, longitude) => {
    try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));
        const result = await Promise.race([ Location.reverseGeocodeAsync({ latitude, longitude }), timeout ]);
        if (!result || result.length === 0) return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

        const addr = result[0];
        let parts = [];
        if (addr.street) parts.push(addr.street);
        if (addr.name && addr.name !== addr.street && addr.name !== "Unnamed Road") parts.push(addr.name);
        if (addr.district || addr.city) parts.push(addr.district || addr.city);
        if (addr.region) parts.push(addr.region);

        return parts.length > 0 ? parts.join(", ") : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
        return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  useEffect(() => {
    if (!locationPermissionGranted) return;
    let subscription;

    const watchLocation = async () => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && !selectedLocation && isMountedRef.current) {
           const { latitude, longitude } = lastKnown.coords;
           setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`); 
           setSelectedLocation({ latitude, longitude });
        }

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
          async (loc) => {
            if (!isMountedRef.current) return;
            const lat = loc.coords.latitude;
            const lon = loc.coords.longitude;
            const newPoint = { latitude: lat, longitude: lon };
            const coordString = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

            setSelectedLocation(newPoint);
            setLocation(coordString);

            if (locationUpdateTimeoutRef.current) clearTimeout(locationUpdateTimeoutRef.current);

            // Asynchronous reverse geocoding to prevent UI blocking
            locationUpdateTimeoutRef.current = setTimeout(async () => {
              if (!isOnline) return; 
              const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
              
              if (addressCache[coordKey]) {
                  if (isMountedRef.current) setLocation(addressCache[coordKey]);
                  return;
              }

              const readable = await convertToReadableLocation(lat, lon);
              if (readable && readable !== "Unnamed Road" && isMountedRef.current) {
                  setLocation(readable);
                  setAddressCache(prev => ({ ...prev, [coordKey]: readable }));
                  await EncryptedStorage.setItem("lastLocationData", JSON.stringify({ latitude: lat, longitude: lon, readable, timestamp: Date.now() }));
              }
            }, 800); 
          }
        );
      } catch (err) { Logger.error("Location watch failed", err); }
    };

    watchLocation();
    return () => { if (subscription) subscription.remove(); };
  }, [locationPermissionGranted, isOnline]);

  const requestLocationPermission = async () => {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        if (isMountedRef.current) { setLocationPermissionGranted(true); setShowPermissionPrompt(false); }
        return true;
      }
      if (status === 'denied' && canAskAgain) {
        const { status: requestStatus } = await Location.requestForegroundPermissionsAsync();
        if (requestStatus === 'granted') {
          if (isMountedRef.current) { setLocationPermissionGranted(true); setShowPermissionPrompt(false); }
          return true;
        }
      }
      if (isMountedRef.current) { setLocationPermissionGranted(false); setShowPermissionPrompt(true); }

      if (!canAskAgain) {
        Alert.alert(t('enableperset'), 'Please enable location permission in settings to continue.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]);
      }
      return false;
    } catch (err) {
      if (isMountedRef.current) { setLocationPermissionGranted(false); setShowPermissionPrompt(true); }
      return false;
    }
  };

  // --- Strict Validation ---
  const validateForm = () => {
    if (!incidentType.trim()) return { valid: false, error: t('errorincident') };
    if (!location.trim() || !selectedLocation) return { valid: false, error: t('waitloc') };
    
    if (incidentType !== 'Others' && !subType.trim()) {
      return { valid: false, error: t('selectsubtype') };
    }
    
    if (incidentType === 'Others') {
        const desc = incidentDescription.trim();
        if (!desc) return { valid: false, error: t('missingdesc') };
        if (desc.length < 5) return { valid: false, error: "Description must be at least 5 characters long." };
    }

    if (incidentType === 'Medical Emergency') {
        if (patientAge.trim()) {
            const ageNum = parseInt(patientAge, 10);
            if (!/^\d+$/.test(patientAge.trim()) || isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
                return { valid: false, error: "Age must be a valid number between 0 and 120." };
            }
        }
        if (patientName.trim()) {
            if (patientName.trim().length > 50) return { valid: false, error: "Patient name is too long." };
        }
    }
    return { valid: true };
  };

  // --- Core Submission Logic ---
  const handleReportSubmission = async (isAutoSubmit = false, mediaPayload = media) => {
    if (isSubmittingRef.current) return;
    
    const validation = validateForm();
    if (!validation.valid) {
        Alert.alert('Validation Error', validation.error);
        return;
    }

    isSubmittingRef.current = true;
    if (isMountedRef.current) {
        setIsSubmitting(true);
        setProgressStep('Preparing report...');
    }

    if (isAutoSubmit) {
      if (isMountedRef.current) setShowManualSubmitButton(false);
      if (autoSubmitFallbackRef.current) clearTimeout(autoSubmitFallbackRef.current);
      autoSubmitFallbackRef.current = setTimeout(() => { 
          if (isMountedRef.current) setShowManualSubmitButton(true); 
      }, 5000);
    }

    const reportData = {
      incidentType,
      subType,
      incidentDescription: incidentDescription.trim(),
      incidentTime: incidentTime || new Date(),
      location: selectedLocation ? `${selectedLocation.latitude},${selectedLocation.longitude}` : location,
      processed_location: location,
      media: mediaPayload.slice(0, 3), // Limit max 3 uploads
      isConscious,
      patientName: patientName.trim(),
      patientAge: patientAge.trim(),
      patientGender
    };

    try {
      if (isMountedRef.current) setProgressStep('Uploading...');
      
      const formData = new FormData();
      formData.append('incidentType', reportData.incidentType);
      formData.append('subType', reportData.subType);
      formData.append('incidentDescription', reportData.incidentDescription);
      formData.append('incidentTime', formatDateTime(reportData.incidentTime));
      formData.append('location', reportData.location);
      formData.append('processed_location', reportData.processed_location);
      
      if (Array.isArray(reportData.media)) {
        reportData.media.forEach((item, i) => {
          if (item && item.uri) {
            formData.append('media', { uri: item.uri, name: item.name || `media_${i}_${Date.now()}.webp`, type: item.type || 'image/webp' });
          }
        });
      }

      if (reportData.incidentType === 'Medical Emergency') {
        formData.append('isConscious', reportData.isConscious ? 'true' : 'false');
        formData.append('patientName', reportData.patientName);
        formData.append('patientAge', reportData.patientAge);
        formData.append('patientGender', reportData.patientGender);
      }

      // Direct Upload Attempt (No ping)
      await axios.post(`${SERVER_URL}/report_incident`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` },
        timeout: 15000, 
      });

      if (isMountedRef.current) setProgressStep('Success!');
      Alert.alert("Success", t('successrep'), [
          {
            text: "Home",
            onPress: () => {
              if (role === "admin") navigation.navigate("AdminDashboard");
              else if (role === "responder_personnel" || role === "responder_head") navigation.navigate("ResponderDashboard");
              else navigation.navigate("UserHome");
            },
          },
          { text: "Ok" },
        ], { cancelable: false });
      
      resetFormFields();

    } catch (err) {
      if (err.response?.status === 409) {
        Alert.alert("Duplicate Report", t('duplicatealert'));
        resetFormFields();
      } else if (err.response?.status === 401) {
        Alert.alert("Unauthorized", "Session expired. Please log in again.");
      } else if (err.response?.status === 400) {
        Alert.alert("Validation Error", "The server rejected the data formatting. Please check your inputs.");
      } else {
        // Enqueue enhanced payload for Timeout / Network / 5xx
        if (isMountedRef.current) setProgressStep('Saving offline...');
        Logger.warn("Upload failed, queueing report", err);

        const queuedPayload = {
            ...reportData,
            queue_meta: {
                uuid: generateUUID(),
                created_at: Date.now(),
                retry_count: 0,
                next_retry: Date.now() + 5000, // 5s initial backoff
                last_error: err.message,
                upload_status: 'pending',
                app_version: '1.0.0', // Configured per env
                platform: RNPlatform.OS,
                offline_reason: !isOnline ? 'offline' : 'server_error'
            }
        };

        const result = await queueService.enqueueReport(queuedPayload);
        const items = await queueService.getQueue();
        if (isMountedRef.current) setQueue(items);

        if (result.success) {
            Alert.alert("Offline", t("offlinequeue"));
            if (!isOnline && typeof sendSMSReport === 'function') sendSMSReport(reportData);
            resetFormFields();
        } else {
            Alert.alert("Error", "Critical storage failure: Could not queue report.");
        }
      }
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
          setIsSubmitting(false);
          setProgressStep(null);
      }
      if (isAutoSubmit && autoSubmitFallbackRef.current) {
        clearTimeout(autoSubmitFallbackRef.current);
        autoSubmitFallbackRef.current = null;
        if (isMountedRef.current) setShowManualSubmitButton(false);
      }
    }
  };

  // --- Background Image Processing ---
  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP });
      const filename = result.uri.split('/').pop().replace(/\.\w+$/, '.webp');
      return { uri: result.uri, name: filename, type: 'image/webp' };
    } catch (err) {
      Logger.warn("Compression failed, retaining original", err);
      return { uri, name: uri.split('/').pop(), type: 'image/jpeg' };
    }
  };

  const openCamera = async () => {
    if (isCameraLaunchingRef.current || isSubmittingRef.current) return;
    
    const validation = validateForm();
    if (!validation.valid) {
        Alert.alert('Error', validation.error);
        return;
    }

    isCameraLaunchingRef.current = true;
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert(t('campermission'));
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [4, 3],
        quality: 1
      });

      if (!result.canceled && result.assets?.length > 0) {
        if (isMountedRef.current) {
            setIsSubmitting(true);
            setProgressStep('Compressing image...');
        }
        
        const originalUri = result.assets[0].uri;
        const finalMediaItem = await compressImage(originalUri);
        const newMediaArray = [...media, finalMediaItem].slice(0, 3);
        
        if (isMountedRef.current) setMedia(newMediaArray);
        
        // Trigger auto-submit EXACTLY once, maintaining workflow
        handleReportSubmission(true, newMediaArray);
      }
    } catch (err) {
      Logger.error("Camera pipeline error", err);
    } finally {
      isCameraLaunchingRef.current = false;
      if (!isSubmittingRef.current && isMountedRef.current) setIsSubmitting(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    resetFormFields();

    if (selectedLocation) {
      setLocation(`${selectedLocation.latitude.toFixed(6)}, ${selectedLocation.longitude.toFixed(6)}`);
      if (isOnline) {
        try {
          const readable = await convertToReadableLocation(selectedLocation.latitude, selectedLocation.longitude);
          if (isMountedRef.current) setLocation(readable);
          EncryptedStorage.setItem("lastLocationData", JSON.stringify({ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude, readable, timestamp: Date.now() })).catch(()=>{});
        } catch (error) {}
      }
    }
    if (isMountedRef.current) setRefreshing(false);
  }, [selectedLocation, isOnline, resetFormFields]); 
  
  // --- Memoized Priority Search Subtypes ---
  const filteredSubtypes = useMemo(() => {
    if (!incidentType || incidentType === "Others" || !subTypes[incidentType]) return [];
    const query = subtypeSearchQuery.toLowerCase().trim();
    if (!query) return subTypes[incidentType];

    return subTypes[incidentType]
        .filter(item => item.toLowerCase().includes(query))
        .sort((a, b) => {
            const aStarts = a.toLowerCase().startsWith(query);
            const bStarts = b.toLowerCase().startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });
  }, [incidentType, subtypeSearchQuery, subTypes]);

  // --- Render ---
  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity 
        style={styles.stationButton} 
        onPress={() => navigation.navigate('StationModal')}
        accessibilityRole="button"
        accessibilityLabel="Station Details"
        disabled={isSubmitting}
      >
        <Text style={styles.stationButtonText}>Station Details</Text>
      </TouchableOpacity>

      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.header} accessibilityRole="header">{t('reportincident')}</Text>

        {showPermissionPrompt ? (
          <View style={styles.permissionBox} accessible={true}>
            <Text style={styles.permissionText}>{t('locationpermission')}</Text>
            <TouchableOpacity style={[styles.pickMediaButton, { backgroundColor: '#f00' }]} onPress={requestLocationPermission} accessibilityRole="button">
              <Text style={styles.buttonText}>{t('tryagain')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {selectedLocation && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }} accessible={true} accessibilityLabel={`Network status: ${isOnline ? 'Online' : 'Offline'}`}>
                <Text style={styles.coordinates}>GPS for Location Tracking      [Internet Status]</Text>
                <Icon name={isOnline ? 'wifi' : 'wifi-off'} size={20} color={isOnline ? 'green' : 'red'} style={{ marginLeft: 8 }} />
              </View>
            )}

            <TextInput style={styles.input} placeholder="Location" value={location} editable={false} accessibilityLabel="Current GPS Location" />

            <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('incidenttype')}</Text>
            <View style={[styles.pickerContainer, { marginBottom: 12, backgroundColor: '#fff' }]}>
              <Picker
                selectedValue={incidentType}
                onValueChange={(v) => setIncidentType(v)}
                style={{ color: '#000', backgroundColor: '#fff' }} 
                dropdownIconColor="#000"
                enabled={!isSubmitting}
              >
                <Picker.Item label={t('selectincidenttype')} value="" />
                {incidentTypes.map((type, i) => (
                  <Picker.Item key={i} label={type} value={type} />
                ))}
              </Picker>
            </View>

            {incidentType && incidentType !== "Others" && subTypes[incidentType] && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('subtyperequiredtittle')}{incidentType}</Text>
                <TouchableOpacity 
                    style={[styles.input, { justifyContent: 'center' }]} 
                    onPress={() => {
                        setSubtypeSearchQuery('');
                        setIsSubtypeModalVisible(true);
                    }}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel="Select incident subtype"
                >
                    <Text style={{ color: subType ? '#000' : '#888' }}>
                        {subType || `${t('subtyperequired')} ${incidentType}`}
                    </Text>
                </TouchableOpacity>
              </>
            )}

            {incidentType === "Medical Emergency" && subType && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>{t('iscon')}</Text>
                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginRight: 6, backgroundColor: isConscious === true ? 'green' : '#007BFF' }]}
                    onPress={() => setIsConscious(true)}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginLeft: 6, backgroundColor: isConscious === false ? 'red' : '#007BFF' }]}
                    onPress={() => setIsConscious(false)}
                    disabled={isSubmitting}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.buttonText, { color: '#fff' }]}>{t('no')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            
            {incidentType === "Medical Emergency" && isConscious !== null && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8, color: '#000' }}>Patient Information</Text>
                <TextInput style={styles.input} placeholder={t('patientname')} placeholderTextColor="#888" value={patientName} onChangeText={setPatientName} editable={!isSubmitting} maxLength={50} />
                <TextInput style={styles.input} placeholder={t('patientage')} placeholderTextColor="#888" value={patientAge} onChangeText={(v) => setPatientAge(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" editable={!isSubmitting} maxLength={3} />
                <View style={[styles.pickerContainer, { marginBottom: 12, backgroundColor: '#fff' }]}>
                  <Picker selectedValue={patientGender} onValueChange={(v) => setPatientGender(v)} style={{ color: '#000', backgroundColor: '#fff' }} dropdownIconColor="#000" enabled={!isSubmitting}>
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
                  style={[styles.input, { color: '#000', backgroundColor: '#fff', minHeight: 80 }]}
                  placeholder={t('descEx')} placeholderTextColor="#888" value={incidentDescription}
                  onChangeText={setIncidentDescription} multiline editable={!isSubmitting}
                />
              </>
            )}
            
            <TextInput style={styles.input} placeholder={t('time')} placeholderTextColor={'#888'} value={incidentTime ? formatDateTime(incidentTime) : ""} editable={false} accessibilityLabel="Incident Time" />

            <ScrollView horizontal>
              {media.map((file, index) => (
                <View key={index} style={{ position: 'relative', marginRight: 10 }}>
                  <Image source={{ uri: file.uri }} style={styles.mediaPreview} accessibilityLabel="Captured Image Preview" />
                  <TouchableOpacity style={styles.removeButton} onPress={() => setMedia(prev => prev.filter((_, i) => i !== index))} disabled={isSubmitting} accessibilityRole="button" accessibilityLabel="Remove Image">
                    <Text style={styles.removeButtonText}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.pickMediaButton, styles.buttonContainer, isSubmitting && { opacity: 0.6 }]} 
              onPress={openCamera}
              disabled={isSubmitting || media.length >= 3}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{media.length >= 3 ? 'Max Images Reached' : t('opencam')}</Text>
            </TouchableOpacity>

            {showManualSubmitButton && (
              <TouchableOpacity 
                style={[styles.pickMediaButton, styles.buttonContainer, { backgroundColor: '#28a745' }]} 
                onPress={() => handleReportSubmission(false)}
                disabled={isSubmitting}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Submit Report</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* Production-Optimized Subtype Search Modal */}
      <Modal visible={isSubtypeModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle} accessibilityRole="header">Select Subtype</Text>
                      <TouchableOpacity onPress={() => setIsSubtypeModalVisible(false)} accessibilityRole="button">
                          <Text style={styles.modalCloseText}>Close</Text>
                      </TouchableOpacity>
                  </View>
                  <TextInput 
                      style={styles.searchInput} 
                      placeholder="Search subtype..." 
                      placeholderTextColor="#888"
                      value={subtypeSearchQuery}
                      onChangeText={setSubtypeSearchQuery}
                      autoFocus
                      accessibilityLabel="Search subtypes input"
                  />
                  {filteredSubtypes.length === 0 ? (
                      <Text style={styles.noResultsText}>No matching subtype found</Text>
                  ) : (
                      <FlatList 
                          data={filteredSubtypes}
                          keyExtractor={(item) => item}
                          initialNumToRender={15}
                          windowSize={5}
                          maxToRenderPerBatch={10}
                          removeClippedSubviews={true}
                          keyboardShouldPersistTaps="handled"
                          renderItem={({ item }) => (
                              <TouchableOpacity 
                                  style={styles.subtypeItem} 
                                  onPress={() => {
                                      setSubType(item);
                                      setIsSubtypeModalVisible(false);
                                  }}
                                  accessibilityRole="button"
                              >
                                  <Text style={styles.subtypeItemText}>{item}</Text>
                              </TouchableOpacity>
                          )}
                      />
                  )}
              </View>
          </View>
      </Modal>

      {/* Progress Feedback Overlay */}
      <Modal visible={isSubmitting} transparent animationType="fade">
        <View style={styles.progressOverlay}>
          <View style={styles.progressBox}>
            <ActivityIndicator size="large" color="#007BFF" />
            <Text style={styles.progressText}>{progressStep || 'Processing...'}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#fff', flex: 1 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', marginTop: 30, color: '#000' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 12 , backgroundColor: '#fff', color: '#000', minHeight: 48 },
  mediaPreview: { width: 100, height: 100, borderRadius: 8 },
  coordinates: { fontSize: 14, color: '#555' },
  removeButton: { position: 'absolute', top: 0, right: 0, backgroundColor: 'red', borderRadius: 50, width: 22, height: 22, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  removeButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden', color:'black' },
  pickMediaButton: { borderRadius: 15, backgroundColor: '#007BFF', padding: 14, alignItems: 'center', minHeight: 48 },
  buttonContainer: { marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  permissionBox: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#f00' },
  permissionText: { color: '#f00', fontWeight: 'bold', marginBottom: 12, fontSize: 16 },
  stationButton: {
    position: 'absolute', top: 10, right: 20, backgroundColor: '#007BFF', paddingVertical: 12,
    paddingHorizontal: 16, borderRadius: 20, zIndex: 1000, elevation: 5, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, minHeight: 44, justifyContent: 'center'
  },
  stationButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  
  // Modal Styles
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  modalCloseText: { color: '#007BFF', fontSize: 16, fontWeight: 'bold', padding: 5 },
  searchInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 15, color: '#000', backgroundColor: '#f9f9f9', minHeight: 48 },
  subtypeItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#eee', minHeight: 48, justifyContent: 'center' },
  subtypeItemText: { fontSize: 16, color: '#000' },
  noResultsText: { textAlign: 'center', color: '#888', marginTop: 20, marginBottom: 40, fontSize: 16 },

  // Progress Styles
  progressOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  progressBox: { padding: 24, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
  progressText: { marginLeft: 16, fontSize: 16, color: '#000', fontWeight: '500' }
});

export default ReportIncident;