import { SERVER_URL } from '@env';
import NetInfo from "@react-native-community/netinfo";
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from "@react-navigation/native";
import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import haversine from 'haversine-distance';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import SendSMS from 'react-native-sms';
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
  const { stationMap } = useContext(IncidentStationMapContext);

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
    "fire": ["BFP"],
    "kalayo": ["BFP"],
    "sunog": ["BFP"],
    "aso": ["BFP"],
    "pagsunog": ["BFP"],
    "flame": ["BFP"],
    "blaze": ["BFP"],
    "smoke": ["BFP"],
    "burn": ["BFP"],
    "ignite": ["BFP"],
    "incendio": ["BFP"],
    "flaming": ["BFP"],
    "combustion": ["BFP"],
    "charred": ["BFP"],
    "spark": ["BFP"],
    "fireball": ["BFP"],
    "pyro": ["BFP"],
    "smolder": ["BFP"],
    "ash": ["BFP"],
    "conflagration": ["BFP"],

    // Accidents / Collisions / Injuries
    "accident": ["Rescuer", "Ambulance"],
    "aksidente": ["Rescuer", "Ambulance"],
    "bangga": ["Rescuer", "Ambulance"],
    "trahedya": ["Rescuer", "Ambulance"],
    "disgrasya": ["Rescuer", "Ambulance"],
    "injury": ["Ambulance"],
    "samad": ["Ambulance"],
    "pilas": ["Ambulance"],
    "wound": ["Ambulance"],
    "crash": ["Rescuer", "Ambulance"],
    "collision": ["Rescuer", "Ambulance"],
    "bruise": ["Ambulance"],
    "fracture": ["Ambulance"],
    "bleeding": ["Ambulance"],
    "cut": ["Ambulance"],
    "road accident": ["Rescuer", "Ambulance"],
    "vehicle crash": ["Rescuer", "Ambulance"],

    // Medical / Health
    "medical": ["Ambulance"],
    "medikal": ["Ambulance"],
    "sakit": ["Ambulance"],
    "wala sang paminsaron": ["Ambulance"],
    "hilanat": ["Ambulance"],
    "kasingkasing": ["Ambulance"],
    "dughan": ["Ambulance"],
    "faint": ["Ambulance"],
    "heart": ["Ambulance"],
    "unconscious": ["Ambulance"],
    "illness": ["Ambulance"],
    "infection": ["Ambulance"],
    "disease": ["Ambulance"],
    "stroke": ["Ambulance"],
    "fever": ["Ambulance"],
    "pain": ["Ambulance"],
    "asthma": ["Ambulance"],
    "diabetes": ["Ambulance"],
    "vomit": ["Ambulance"],
    "pregnancy": ["Ambulance"],
    "labor": ["Ambulance"],

    // Crime / Violence / Theft
    "robbery": ["PNP"],
    "kawat": ["PNP"],
    "sudlan balay": ["PNP"],
    "krimen": ["PNP"],
    "kapintas": ["PNP"],
    "theft": ["PNP"],
    "crime": ["PNP"],
    "violence": ["PNP"],
    "assault": ["PNP"],
    "burglary": ["PNP"],
    "harrasment": ["PNP"],
    "haras": ["PNP"],
    "murder": ["PNP"],
    "kidnap": ["PNP"],
    "steal": ["PNP"],
    "armed robbery": ["PNP"],
    "pickpocket": ["PNP"],
    "vandalism": ["PNP"],
    "fight": ["PNP"],
    "shooting": ["PNP"],
    "threat": ["PNP"],

    // Natural Disasters
    "flood": ["Rescuer"],
    "baha": ["Rescuer"],
    "earthquake": ["Rescuer"],
    "linog": ["Rescuer"],
    "landslide": ["Rescuer"],
    "lubak sang duta": ["Rescuer"],
    "storm": ["Rescuer"],
    "bagyo": ["Rescuer"],
    "tsunami": ["Rescuer"],
    "balud": ["Rescuer"],
    "tornado": ["Rescuer"],
    "typhoon": ["Rescuer"],
    "hail": ["Rescuer"],
    "flooding": ["Rescuer"],
    "overflow": ["Rescuer"],
    "eruption": ["Rescuer"],
    "volcano": ["Rescuer"],
    "mudslide": ["Rescuer"],
    "rescue": ["Rescuer"],
    "responder": ["Rescuer"],
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
  
  // Check network quality
  const checkNetworkQuality = async () => {
    const testPing = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

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

    // Run multiple pings
    const samples = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await testPing());
    }
    const sorted = samples.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Upload test (5 attempts, require 3 successes)
    let successCount = 0;
    for (let i = 0; i < 5; i++) {
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
    const uploadOk = successCount >= 3;

    console.log("Network quality check:", { samples, median, successCount, uploadOk });

    // Decision: combine latency + upload result
    if (!uploadOk) {
      return { status: "bad", latency: median }; // SMS fallback
    }

    if (median < 200) return { status: "strong", latency: median };   // fast + uploads ok
    if (median < 500) return { status: "moderate", latency: median }; // ok + uploads ok
    if (median < 1000) return { status: "weak", latency: median };    // slow but stable

    return { status: "bad", latency: median }; // too unstable
  };

  // Load queued reports from storage on mount
  useEffect(() => {
    const loadQueue = async () => {
      const storedQueue = await EncryptedStorage.getItem('offline_reports');
      if (storedQueue) setQueue(JSON.parse(storedQueue));
      console.log('Loaded offline reports queue:', storedQueue ? JSON.parse(storedQueue) : []);
    };
    loadQueue();
    }, []);

  // Auto-submit queued reports when back online
  useEffect(() => {
    if (isOnline) processOfflineQueue();
  }, [isOnline]);
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
    if (queue.length === 0) return;

    const failedReports = [];

    for (const reportData of queue) {
      const netQuality = await checkNetworkQuality();
      console.log("Processing queued report, network:", netQuality.status);

      if (
        isOnline ||
        netQuality.status === "strong" ||
        netQuality.status === "moderate" ||
        netQuality.status === "weak"
      ) {
        try {
          const formData = new FormData();
          formData.append('incidentType', reportData.subType || reportData.incidentType);
          formData.append('incidentDescription', reportData.incidentDescription);
          formData.append('incidentTime', reportData.incidentTime);
          formData.append('processed_location', reportData.location); 
          formData.append('location', reportData.location);
          formData.append('station_ids', reportData.station_ids.join(','));

          reportData.media.forEach((uri, i) => {
            formData.append('media', {
              uri,
              name: `media_${i}_${Date.now()}.jpg`,
              type: 'image/jpeg'
            });
          });

          if (reportData.incidentType === 'Medical Emergency') {
            formData.append('isConscious', reportData.isConscious ? 'true' : 'false');
            formData.append('patientName', reportData.patientName || '');
            formData.append('patientAge', reportData.patientAge || '');
            formData.append('patientGender', reportData.patientGender || '');
          }

          await axios.post(`${SERVER_URL}/report_incident`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              Authorization: `Bearer ${token}`,
            },
          });

          console.log("Queued report submitted:", reportData);
        } catch (err) {
          console.log("Failed to submit queued report, keeping in queue:", err);
          failedReports.push(reportData);
        }
      } else {
        failedReports.push(reportData);
      }
    }

    // Update queue and storage
    setQueue(failedReports);

    if (failedReports.length > 0) {
      await EncryptedStorage.setItem('offline_reports', JSON.stringify(failedReports));
    } else {
      // All reports uploaded successfully → clear storage
      await EncryptedStorage.removeItem('offline_reports');
    }

    if (failedReports.length === 0) {
      Alert.alert('All queued reports submitted successfully.');
    } else if (failedReports.length < queue.length) {
      Alert.alert(
        `${queue.length - failedReports.length} queued reports submitted, ${failedReports.length} still pending.`
      );
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
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 5000 },
        async (loc) => {
          const lat = loc.coords.latitude;
          const lon = loc.coords.longitude;
          const newPoint = { latitude: lat, longitude: lon };
          setSelectedLocation(newPoint);

          // Check movement distance
          const moved = lastLocation ? haversine(lastLocation, newPoint) : Infinity;
          if (moved < 100) {
            setLocation(lastReadable || `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            return;
          }

          setLastLocation(newPoint);

          if (isOnline) {
            const net = await checkNetworkQuality();
            console.log("Network quality:", net.status);

            if (net.status === "strong" || net.status === "moderate" || net.status === "weak") {
              const readable = await convertToReadableLocation(lat, lon);
              setLocation(readable);
              setLastReadable(readable);

              await EncryptedStorage.setItem(
                "lastLocationData",
                JSON.stringify({
                  latitude: lat,
                  longitude: lon,
                  readable: readable,
                  timestamp: Date.now(),
                })
              );
            } else {
              setLocation(lastReadable || `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            }
          } else {
            setLocation(lastReadable || `${lat.toFixed(6)}, ${lon.toFixed(6)}`);
          }
        }
      );
    };

    watchLocation();
    return () => { if (subscription) subscription.remove(); };
  }, [locationPermissionGranted, isOnline, lastLocation, lastReadable]);

  const requestLocationPermission = async () => {
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationPermissionGranted(false);
        setShowPermissionPrompt(true);
        if (!canAskAgain) Alert.alert('Enable location permission from settings.');
        return;
      }
      setLocationPermissionGranted(true);
      setShowPermissionPrompt(false);
    } catch (err) {
      setLocationPermissionGranted(false);
      setShowPermissionPrompt(true);
      Alert.alert('Error requesting location permission', err.message);
    }
  };
  //console.log("Readable Location:", location);
  const convertToReadableLocation = async (latitude, longitude) => {
    const timeout = (ms) =>
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms));

    try {
      const result = await Promise.race([
        Location.reverseGeocodeAsync({ latitude, longitude }),
        timeout(3000),
      ]);

      if (!result || result.length === 0) return "Unnamed Road";

      const addr = result[0];
      const formatted = [
        addr.name && addr.name.toLowerCase() !== "unnamed road" ? addr.name : null,
        addr.street,
        addr.city || addr.town || addr.village,
        addr.region,
        addr.country,
      ]
        .filter(Boolean)
        .join(", ");

      return formatted.trim() || "Unnamed Road";
    } catch {
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  const saveToQueue = async (reportData) => {
    const updatedQueue = [...queue, reportData];
    setQueue(updatedQueue);
    await EncryptedStorage.setItem('offline_reports', JSON.stringify(updatedQueue));
  };
  const requestSMSPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        {
          title: 'SMS Permission',
          message: 'This app needs permission to send SMS reports to emergency stations.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny'
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.log('SMS permission error:', err);
      return false;
    }
  };
  //sms reporting
  const sendSMSReport = async (reportData) => {
    console.log("sendSMSReport called with:", { reportData, nearestStations });

    if (!reportData.station_ids?.length) {
      console.log("No station IDs found in reportData:", reportData);
      return;
    }

    const hasPermission = await requestSMSPermission();
    console.log("SMS permission granted:", hasPermission);
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'SMS permission is required to send reports.');
      return;
    }

    const recipients = nearestStations
      .filter(s => reportData.station_ids.includes(s.id))
      .map(s => s.contact)
      .slice(0, 3);

    console.log("Recipients filtered for SMS:", recipients);
    if (!recipients.length) {
      Alert.alert('No SMS recipients available.');
      return;
    }


    const message = `
    Type of Incident: ${reportData.incidentType}
    that has a ${reportData.subType ? `sub-type of ${reportData.subType}` : 'no specified sub-type'}
    Description: ${reportData.incidentDescription}
    Location: ${reportData.processed_location}
    Date/Time: ${formatSMSDateTime(reportData.incidentTime)}
    This Message Generated By UIRS System ...
    `;

    console.log("SMS message content:", message);

    let acknowledged = false;

    // Start timeout for delivery acknowledgment (e.g., 10s)
    const deliveryTimeout = setTimeout(() => {
      if (!acknowledged) {
        Alert.alert(
          'Delivery Failed',
          'SMS could not be confirmed as sent. Please check network or retry.',
          [{ text: 'Retry', onPress: () => retryLastReport() }]
        );
      }
    }, 10000); // 10 seconds, adjust as needed

    SendSMS.send(
      {
        body: message,
        recipients: recipients,
        successTypes: ['sent', 'queued'],
        allowAndroidSendWithoutReadPermission: false,
      },
      async (completed, cancelled, error) => {
        acknowledged = true; // mark callback received
        clearTimeout(deliveryTimeout);

        console.log("SMS callback:", { completed, cancelled, error });

        if (completed) {
          Alert.alert(
            'Success',
            `SMS sent to ${recipients.join(', ')}`,
            [{ text: 'OK', onPress: () => onRefresh() }]
          );
        } else if (cancelled) {
          Alert.alert(
            'Cancelled',
            'SMS sending cancelled.',
            [{ text: 'OK', onPress: () => retryLastReport() }]
          );
        } else if (error && !completed && !cancelled) {
          console.log('SMS sending failed.', error);
          Alert.alert(
            'Error',
            'Failed to send SMS. Please try again.',
            [{ text: 'Retry', onPress: () => retryLastReport() }]
          );
        }
      }
    );
  };
  // Manual retry
  const retryLastReport = () => {
    console.log("retryLastReport called. Last report:", lastReport);
    if (lastReport) {
      sendSMSReport(lastReport);
    } else {
      Alert.alert('No previous report to retry.');
    }
  };
  //report incident
  const submitReport = async (reportData, showAlert = true, resetFields = true, isOnline) => {
    setIsSubmitting(true);

    const networkQuality = await checkNetworkQuality();
    console.log("Submit network quality:", networkQuality);

    if (isOnline || networkQuality.status === "strong" || networkQuality.status === "moderate" || networkQuality.status === "weak") {
      try {
        const formData = new FormData();
        formData.append('incidentType', reportData.incidentType);
        formData.append('subType', reportData.subType);
        formData.append('incidentDescription', reportData.incidentDescription);
        formData.append('incidentTime', formatDateTime(reportData.incidentTime));
        formData.append('location', reportData.location);
        formData.append('processed_location', reportData.processed_location);
        formData.append('station_ids', reportData.station_ids.join(','));
        reportData.media.forEach((item, i) => {
          formData.append('media', {
            uri: item.uri,
            name: item.name,
            type: item.type
          });
        });


        if (reportData.incidentType === 'Medical Emergency') {
          formData.append('isConscious', reportData.isConscious ? 'true' : 'false');
          formData.append('patientName', reportData.patientName || '');
          formData.append('patientAge', reportData.patientAge || '');
          formData.append('patientGender', reportData.patientGender || '');
        }

        console.log('Submitting report:', reportData);

        await axios.post(`${SERVER_URL}/report_incident`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`
          }
        });

        if (showAlert) {
          Alert.alert(
            "Success",
            "Incident report submitted successfully.",
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

      } catch (err) {
        if (err.response && err.response.status === 409) {
          Alert.alert(
            "Duplicate Report",
            "You already reported this incident. Please avoid multiple reports for the same accident."
          );
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
        } else {
          Alert.alert("Error", "Error submitting report. Try again later.");
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
      }
    } else {
      // Offline or poor connection fallback
      await saveToQueue(reportData);
      Alert.alert(
        "Offline",
        "You are offline or have poor network. The report has been saved and will be submitted automatically when the connection improves."
      );
      sendSMSReport(reportData);
      setLastReport(reportData);
    }

    setIsSubmitting(false);
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
      console.log("Error checking duplicate incident:", err);
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
        "Possible Duplicate Report",
        "There seems to be an existing report of a similar incident nearby. Do you still want to submit this report?",
        [
          { text: "No", style: "cancel" },
          { text: "Yes", onPress: () => submitReport(reportData, true, true, isOnline) }
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
    if (!granted) return Alert.alert('Camera permission not granted');

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
      return Alert.alert('Error', 'Select an incident type first.');
    }

    if (!location.trim()) {
      return Alert.alert('Error', 'Wait for your location first.');
    }

    if (incidentType !== 'Others' && !subType.trim()) {
      return Alert.alert('Error', 'Select a sub-type for this incident.');
    }

    const trimmedDesc = incidentDescription.trim();

    if (incidentType === "Others") {
      if (!trimmedDesc) {
        return Alert.alert("Missing Description", "Enter a valid description");
      }

      const lowerDesc = trimmedDesc.toLowerCase();
      const matchedKeywords = Object.keys(stationKeywords).filter(word => lowerDesc.includes(word));

      if (!matchedKeywords.length) {
        return Alert.alert(
          "No Keywords Found",
          "Your description does not contain any recognized keywords."
        );
      }
    }

    openCamera();
  };
  const removeMedia = (index) => setMedia(prev => prev.filter((_, i) => i !== index));
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    
    if (selectedLocation && isOnline) {
      const readable = await convertToReadableLocation(
        selectedLocation.latitude,
        selectedLocation.longitude
      );
      setLocation(readable);
      setLastReadable(readable);
      await EncryptedStorage.setItem(
        "lastLocationData",
        JSON.stringify({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          readable,
          timestamp: Date.now(),
        })
      );
    }
  
    setNearestStations(fetchStationsByType());
    checkNetworkQuality();
    processOfflineQueue();
  
    setIncidentType(''); 
    setIncidentDescription(''); 
    setMedia([]);
    setSubType(''); 
    setIsConscious(null); 
    setPatientName(''); 
    setPatientAge(''); 
    setPatientGender('');
  
    setRefreshing(false);
  }, [selectedLocation, isOnline, fetchStationsByType]);
  
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.header}>Report Incident</Text>

        {showPermissionPrompt ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Location permission is required.</Text>
            <TouchableOpacity style={[styles.pickMediaButton, { backgroundColor: '#f00' }]} onPress={requestLocationPermission}>
              <Text style={styles.buttonText}>Try Again</Text>
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

            <Text style={{ fontSize: 16, marginBottom: 8 }}>Incident Type</Text>
            <View style={[styles.pickerContainer, { marginBottom: 12 }]}>
              <Picker selectedValue={incidentType} onValueChange={(v) => setIncidentType(v)}>
                <Picker.Item label="Select Incident Type" value="" />
                {incidentTypes.map((type, i) => <Picker.Item key={i} label={type} value={type} />)}
              </Picker>
            </View>

            {/* Show sub-type only if type is not Other */}
            {incidentType && incidentType !== "Others" && subTypes[incidentType] && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8 }}>{incidentType} Type</Text>
                <View style={[styles.pickerContainer, { marginBottom: 12 }]}>
                  <Picker
                    selectedValue={subType}
                    onValueChange={(v) => setSubType(v)}
                    enabled={incidentType !== "Others"} // disable when main type is Other
                  >
                    <Picker.Item label={`Select ${incidentType} Type`} value="" />
                    {subTypes[incidentType].map((t, idx) => (
                      <Picker.Item key={idx} label={t} value={t} />
                    ))}
                  </Picker>
                </View>
              </>
            )}

            {incidentType === "Medical Emergency" && subType && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8 }}>Is the patient conscious?</Text>
                <View style={{ flexDirection: "row", marginBottom: 12 }}>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginRight: 6, backgroundColor: isConscious === true ? 'green' : '#007BFF' }]}
                    onPress={() => setIsConscious(true)}
                  >
                    <Text style={styles.buttonText}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pickMediaButton, { flex: 1, marginLeft: 6, backgroundColor: isConscious === false ? 'red' : '#007BFF' }]}
                    onPress={() => setIsConscious(false)}
                  >
                    <Text style={styles.buttonText}>No</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {incidentType === "Medical Emergency" && isConscious && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8 }}>Patient Information</Text>
                <TextInput style={styles.input} placeholder="Patient Name" value={patientName} onChangeText={setPatientName} />
                <TextInput style={styles.input} placeholder="Patient Age" value={patientAge} onChangeText={setPatientAge} keyboardType="numeric" />
                <View style={[styles.pickerContainer, { marginBottom: 12 }]}>
                  <Picker selectedValue={patientGender} onValueChange={(v) => setPatientGender(v)}>
                    <Picker.Item label="Select Gender" value="" />
                    <Picker.Item label="Male" value="Male" />
                    <Picker.Item label="Female" value="Female" />
                  </Picker>
                </View>
              </>
            )}

            {incidentType === "Others" && (
              <>
                <Text style={{ fontSize: 16, marginBottom: 8 }}>Describe the incident</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Example: Theres a violence here at my house ."
                  value={incidentDescription}
                  onChangeText={setIncidentDescription}
                  multiline
                />
              </>
            )}

            <TextInput style={styles.input} placeholder="Time" value={incidentTime ? formatDateTime(incidentTime) : ""} editable={false} />

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
              <Text style={styles.buttonText}>Open Camera</Text>
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
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 12 },
  mediaPreview: { width: 100, height: 100, borderRadius: 8 },
  coordinates: { fontSize: 14, color: '#555' },
  removeButton: { position: 'absolute', top: 0, right: 0, backgroundColor: 'red', borderRadius: 50, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  removeButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, overflow: 'hidden' },
  pickMediaButton: { borderRadius: 15, backgroundColor: '#007BFF', padding: 12, alignItems: 'center' },
  buttonContainer: { marginBottom: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  permissionBox: { padding: 16, backgroundColor: '#fff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#f00' },
  permissionText: { color: '#f00', fontWeight: 'bold', marginBottom: 8 }
});

export default ReportIncident;
