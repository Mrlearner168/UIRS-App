import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN, SERVER_URL } from "@env";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import MapboxGL from "@rnmapbox/maps";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

const STATION_TYPES = ["BFP", "PNP", "Ambulance", "Rescuer"];
const { width, height } = Dimensions.get('window');

export default function AddStationScreen() {
  const navigation = useNavigation();
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [markerCoords, setMarkerCoords] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeForm, setActiveForm] = useState("add");
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");

    // Add Station
  const [addStationId, setAddStationId] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState(STATION_TYPES[0]);

  const [addAddress, setAddAddress] = useState("Select Location");
  const [addLatitude, setAddLatitude] = useState(null);
  const [addLongitude, setAddLongitude] = useState(null);

  const [addContact, setAddContact] = useState("");
  const [addFacebook, setAddFacebook] = useState("");

  const [addCapabilityLevel, setAddCapabilityLevel] = useState("");
  const [addMaxVehicles, setAddMaxVehicles] = useState("");

  // Edit Station
  const [editingStation, setEditingStation] = useState(null);

  const [editStationId, setEditStationId] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState(STATION_TYPES[0]);

  const [editAddress, setEditAddress] = useState("Select Location");
  const [editLatitude, setEditLatitude] = useState(null);
  const [editLongitude, setEditLongitude] = useState(null);

  const [editContact, setEditContact] = useState("");
  const [editFacebook, setEditFacebook] = useState("");

  const [editCapabilityLevel, setEditCapabilityLevel] = useState("");

  const [editMaxVehicles, setEditMaxVehicles] = useState("");

  const {t} = useTranslation();  

  //fetch stations for delete
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (storedToken) {
          setToken(storedToken);
        } else {
          navigation.navigate("Login");
        }
      } catch (error) {
        console.log("Failed to fetch token:", error);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (token) fetchStations();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission denied", t('requiredloc'));
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setMarkerCoords(coords);
        setLoadingLocation(false);
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    })();
  }, []);

  const fetchStations = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/stations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStations(res.data);
    } catch (err) {
      Alert.alert("Error fetching stations", err.message);
    }
  };

  const onRefresh = useCallback(async () => {
      setRefreshing(true);

      try {
          await fetchStations();

          // Reset Add Form
          resetAddForm();

          // Reset Edit Form
          resetEditForm();

          // Reset Map
          setMarkerCoords(null);

          // Reset Search
          setSearchText("");
          setSearchResults([]);

          // Close Modal
          setModalVisible(false);

      } catch (error) {
          console.log(error);
      } finally {
          setRefreshing(false);
      }
  }, [token]);

  const startEdit = (station) => {
      setEditingStation(station.id);

      setEditStationId(station.station_id);
      setEditName(station.name);
      setEditType(station.type);

      setEditAddress(station.address);
      setEditLatitude(station.latitude);
      setEditLongitude(station.longitude);

      setEditContact(station.contact || "");
      setEditFacebook(station.facebook || "");

      setEditCapabilityLevel(String(station.capability_level ?? ""));
      setEditMaxVehicles(String(station.max_vehicles ?? ""));

      setMarkerCoords({
          latitude: station.latitude,
          longitude: station.longitude,
      });
  };

  const resetAddForm = () => {
      setAddStationId("");
      setAddName("");
      setAddType(STATION_TYPES[0]);

      setAddAddress("Select Location");
      setAddLatitude(null);
      setAddLongitude(null);

      setAddContact("");
      setAddFacebook("");

      setAddCapabilityLevel("");
      setAddMaxVehicles("");
      setSearchText("");
      setSearchResults([]);
      setModalVisible(false);
      setMarkerCoords(null);
  };

  const resetEditForm = () => {
      setEditingStation(null);
    
      setEditStationId("");
      setEditName("");
      setEditType(STATION_TYPES[0]);
    
      setEditAddress("Select Location");
      setEditLatitude(null);
      setEditLongitude(null);
    
      setEditContact("");
      setEditFacebook("");
    
      setEditCapabilityLevel("");
      setEditMaxVehicles("");

      setSearchText("");
      setSearchResults([]);
      setModalVisible(false);
      setMarkerCoords(null);
  };
  

  const openModal = async () => {
      try {
          if (!markerCoords) {
              const location = await Location.getCurrentPositionAsync({});

              setMarkerCoords({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
              });
          }

          setModalVisible(true);
      } catch (error) {
          Alert.alert(t('locnotready'));
      }
  };
  const handleSearch = async (query) => {
    setSearchText(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        { params: { access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN, limit: 5, types: "poi,address,place,locality" } }
      );
      setSearchResults(res.data.features || []);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };
  

  const selectSearchResult = (feature) => {
      const [longitude, latitude] = feature.center;

      setMarkerCoords({
          latitude,
          longitude,
      });

      if (activeForm === "add") {
          setAddAddress(feature.place_name);
          setAddLatitude(latitude);
          setAddLongitude(longitude);
      } else if (activeForm === "edit") {
          setEditAddress(feature.place_name);
          setEditLatitude(latitude);
          setEditLongitude(longitude);
      }

      setSearchText(feature.place_name);
      setSearchResults([]);
  };

  const confirmLocation = async () => {
      if (!markerCoords) {
          Alert.alert("Please select a location.");
          return;
      }

      const latitude = markerCoords.latitude;
      const longitude = markerCoords.longitude;

      let address = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;

      try {
          const geoRes = await axios.get(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
              {
                  params: {
                      access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
                  },
              }
          );

          if (geoRes.data.features.length > 0) {
              address = geoRes.data.features[0].place_name;
          }
      } catch (error) {
          console.log("Reverse geocode failed:", error);
      }

      if (activeForm === "add") {
          setAddLatitude(latitude);
          setAddLongitude(longitude);
          setAddAddress(address);
      } else if (activeForm === "edit") {
          setEditLatitude(latitude);
          setEditLongitude(longitude);
          setEditAddress(address);
      }

      setModalVisible(false);
      setSearchResults([]);
      setSearchText("");
  };

  const validateAdd = () => {
    if (!addStationId.trim()) {
      return "Station ID is required";
    }

    if (!/^\d+$/.test(addStationId.trim())) {
      return "Station ID must contain numbers only";
    }

    if (!addName.trim()) {
      return "Station name is required";
    }

    if (!addLatitude || !addLongitude) {
      return "Please select a station location";
    }

    if (
      addContact.trim() &&
      !/^(09\d{9}|\+639\d{9})$/.test(addContact.trim())
    ) {
      return "Invalid contact number";
    }

    if (
      addCapabilityLevel &&
      (Number(addCapabilityLevel) < 1 ||
        Number(addCapabilityLevel) > 5)
    ) {
      return "Capability Level must be between 1 and 5";
    }

    if (
      addMaxVehicles &&
      Number(addMaxVehicles) < 0
    ) {
      return "Maximum vehicles cannot be negative";
    }

    if (
      addFacebook.trim() &&
      !/^https?:\/\/.+/i.test(addFacebook.trim())
    ) {
      return "Facebook URL is invalid";
    }

    return null;
  };

  const validateEdit = () => {
    if (!editStationId.trim()) {
      return "Station ID is required";
    }

    if (!/^\d+$/.test(editStationId.trim())) {
      return "Station ID must contain numbers only";
    }

    if (!editName.trim()) {
      return "Station name is required";
    }

    if (!editLatitude || !editLongitude) {
      return "Please select a station location";
    }

    if (
      editContact.trim() &&
      !/^(09\d{9}|\+639\d{9})$/.test(editContact.trim())
    ) {
      return "Invalid contact number";
    }

    if (
      editCapabilityLevel &&
      (Number(editCapabilityLevel) < 1 ||
        Number(editCapabilityLevel) > 5)
    ) {
      return "Capability Level must be between 1 and 5";
    }

    if (
      editMaxVehicles &&
      Number(editMaxVehicles) < 0
    ) {
      return "Maximum vehicles cannot be negative";
    }

    if (
      editFacebook.trim() &&
      !/^https?:\/\/.+/i.test(editFacebook.trim())
    ) {
      return "Facebook URL is invalid";
    }

    return null;
  };


  const saveStation = async () => {
      const err = validateEdit();

      if (err) {
          Alert.alert(err);
          return;
      }

      if (!token) {
          Alert.alert("Token missing, please login again");
          return;
      }

      setSubmitting(true);

      try {
          // Check existing stations
          const { data: stationsData } = await axios.get(
              `${SERVER_URL}/stations`,
              {
                  headers: {
                      Authorization: `Bearer ${token}`,
                  },
              }
          );

          // Duplicate Station ID
          if (
              stationsData.some(
                  (station) =>
                      station.id !== editingStation &&
                      String(station.station_id) === editStationId.trim()
              )
          ) {
              Alert.alert(t("dupstationid"));
              return;
          }

          // Duplicate Contact
          if (
              editContact.trim() &&
              stationsData.some(
                  (station) =>
                      station.id !== editingStation &&
                      station.contact &&
                      station.contact === editContact.trim()
              )
          ) {
              Alert.alert(t("dupcontact"));
              return;
          }

          // Reverse Geocode
          let readableAddress = editAddress;

          try {
              const geoRes = await axios.get(
                  `https://api.mapbox.com/geocoding/v5/mapbox.places/${editLongitude},${editLatitude}.json`,
                  {
                      params: {
                          access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
                      },
                  }
              );

              if (geoRes.data.features.length > 0) {
                  readableAddress = geoRes.data.features[0].place_name;
              }
          } catch (error) {
              console.log("Reverse geocode failed:", error);
          }

          const payload = {
              station_id: editStationId.trim(),
              name: editName.trim(),
              type: editType,
              address: readableAddress,
              latitude: editLatitude,
              longitude: editLongitude,
              contact: editContact.trim() || null,
              facebook: editFacebook.trim() || null,
              capability_level: Number(editCapabilityLevel) || 1,
              max_vehicles: Number(editMaxVehicles) || 0,
          };
          console.log("Payload for update:", payload);
          await axios.put(
              `${SERVER_URL}/stations_update/${editingStation}`,
              payload,
              {
                  headers: {
                      Authorization: `Bearer ${token}`,
                  },
              }
          );

          Alert.alert(t("stationupdated"));

          resetEditForm();
          fetchStations();

      } catch (err) {
          console.log(err.response?.data || err);

          Alert.alert(
              "Error",
              err.response?.data?.error ||
              err.response?.data?.message ||
              err.message
          );
      } finally {
          setSubmitting(false);
      }
  };
  
  const deleteStation = async (stationId) => {
    try {
      await axios.delete(`${SERVER_URL}/stations_delete/${stationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert(t('stationdel'));
      fetchStations();
    } catch (err) {
      Alert.alert(t('delfailed'));
    }
  };

  const handleSubmit = async () => {
      const err = validateAdd();
    
      if (err) {
          Alert.alert(err);
          return;
      }
    
      if (!token) {
          Alert.alert("Token missing, please login again");
          return;
      }
    
      setSubmitting(true);
    
      try {
          // Get existing stations
          const { data: stationsData } = await axios.get(
              `${SERVER_URL}/stations`,
              {
                  headers: {
                      Authorization: `Bearer ${token}`,
                  },
              }
          );
        
          // Duplicate Station ID
          if (
              stationsData.some(
                  (station) =>
                      String(station.station_id) === addStationId.trim()
              )
          ) {
              Alert.alert(t("dupstationid"));
              return;
          }
        
          // Duplicate Contact
          if (
              addContact.trim() &&
              stationsData.some(
                  (station) =>
                      station.contact &&
                      station.contact === addContact.trim()
              )
          ) {
              Alert.alert(t("dupcontact"));
              return;
          }
        
          // Reverse Geocoding
          let readableAddress = addAddress;
        
          try {
              const geoRes = await axios.get(
                  `https://api.mapbox.com/geocoding/v5/mapbox.places/${addLongitude},${addLatitude}.json`,
                  {
                      params: {
                          access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN,
                      },
                  }
              );
            
              if (geoRes.data.features.length > 0) {
                  readableAddress = geoRes.data.features[0].place_name;
              }
          } catch (error) {
              console.log("Reverse geocode failed:", error);
          }
        
          // Payload
          const payload = {
              station_id: addStationId.trim(),
              name: addName.trim(),
              type: addType,
              address: readableAddress,
              latitude: addLatitude,
              longitude: addLongitude,
              contact: addContact.trim() || null,
              facebook: addFacebook.trim() || null,
              capability_level: Number(addCapabilityLevel) || 1,
              max_vehicles: Number(addMaxVehicles) || 0,
          };
        
          const res = await axios.post(
              `${SERVER_URL}/addstation`,
              payload,
              {
                  headers: {
                      Authorization: `Bearer ${token}`,
                  },
              }
          );
        
          Alert.alert(
              "Success",
              `Station ${res.data.station_id || addStationId} added successfully.`
          );
        
          resetAddForm();
          fetchStations();
        
      } catch (err) {
          console.log(err.response?.data || err);
      
          Alert.alert(
              "Error",
              err.response?.data?.error ||
              err.response?.data?.message ||
              err.message
          );
      } finally {
          setSubmitting(false);
      }
  };
  console.log("Stations", stations);
  console.log("Capability_level" , stations.max_vehicles ,  stations.capability_level);

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: '#F3F4F6'}}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          {["add", "edit", "delete"].map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.tabButton,
                  activeForm === type && styles.activeTabButton,
                ]}
                onPress={() => setActiveForm(type)}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeForm === type && styles.activeTabText,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
          ))}
        </View>

        <View style={styles.contentContainer}>
            {/* Add Station Screen */}
            {activeForm === "add" && (
                <FlatList
                data={[]} // Dummy data just to use FlatList header
                keyExtractor={() => "dummy"}
                contentContainerStyle={{ paddingBottom: 20 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={resetAddForm} />
                }
                ListHeaderComponent={
                    <View style={styles.formCard}>
                    <Text style={styles.cardTitle}>{t('addstation')}</Text>
                
                    <Text style={styles.inputLabel}>{t('stationid')}</Text>
                    <TextInput
                        style={styles.input}
                        value={addStationId}
                        onChangeText={setAddStationId}
                        placeholder="e.g 1234"
                        placeholderTextColor={"#9CA3AF"}
                        keyboardType="numeric"
                    />
            
                    <Text style={styles.inputLabel}>{t('stationname')}</Text>
                    <TextInput
                        style={styles.input}
                        value={addName}
                        onChangeText={setAddName}
                        placeholder={t('enterstationname')}
                        placeholderTextColor={"#9CA3AF"}
                    />
            
                    <Text style={styles.inputLabel}>{t('type')}</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={addType} onValueChange={setAddType} style={styles.picker}>
                        {STATION_TYPES.map((t) => (
                            <Picker.Item key={t} label={t} value={t} />
                        ))}
                        </Picker>
                    </View>
                        
                    <Text style={styles.inputLabel}>{t('stationaddress')}</Text>
                    <TouchableOpacity onPress={openModal} style={styles.locationButton}>
                        <Icon name="map-marker" size={20} color="#007BFF" style={{marginRight: 8}} />
                        <Text style={styles.locationButtonText} numberOfLines={1}>{addAddress}</Text>
                    </TouchableOpacity>
                        
                    <Text style={styles.inputLabel}>{t('stationcontact')}</Text>
                    <TextInput
                        style={styles.input}
                        value={addContact}
                        onChangeText={(text) => {
                            // Remove any non-numeric characters (letters, spaces, symbols)
                            const numericValue = text.replace(/[^0-9]/g, '');
                            setAddContact(numericValue);
                        }}
                        placeholder="09xxxxxxxxx"
                        placeholderTextColor={"#9CA3AF"}
                        keyboardType="phone-pad"
                        maxLength={11}
                    />
                    <Text style={styles.inputLabel}>Capability Level</Text>
                    <TextInput
                        style={styles.input}
                        value={addCapabilityLevel}
                        onChangeText={setAddCapabilityLevel}
                        keyboardType="numeric"
                        placeholder="1 - 5"
                    />


                    <Text style={styles.inputLabel}>Maximum Vehicles</Text>
                    <TextInput
                        style={styles.input}
                        value={addMaxVehicles}
                        onChangeText={setAddMaxVehicles}
                        keyboardType="numeric"
                        placeholder="Maximum vehicles"
                    />
                    <Text style={styles.inputLabel}>Facebook URL (Optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={addFacebook}
                        onChangeText={setAddFacebook}
                        autoCapitalize="none"
                        placeholder="https://facebook.com/yourpage"
                        placeholderTextColor={"#9CA3AF"}
                    />
            
                    <TouchableOpacity
                        style={[styles.submitButton, submitting && styles.buttonDisabled]}
                        onPress={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>{t('savestation')}</Text>
                        )}
                    </TouchableOpacity>
                    </View>
                }
                />
            )}
            
            {/* Edit Screen */}
            {activeForm === "edit" && (
                <FlatList
                data={stations}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ paddingBottom: 20 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={resetEditForm} />
                }
                renderItem={({ item }) => (
                    <View style={styles.stationCard}>
                        {editingStation === item.id ? (
                        <View>
                            <Text style={styles.cardTitle}>{t('updatestation')}</Text>
                            
                            <Text style={styles.inputLabel}>{t('stationid')}</Text>
                            <TextInput
                                style={styles.input}
                                value={editStationId}
                                onChangeText={setEditStationId}
                                placeholder={t('enterstationid')}
                            />
            
                            <Text style={styles.inputLabel}>{t('stationname')}</Text>
                            <TextInput
                                style={styles.input}
                                value={editName}
                                onChangeText={setEditName}
                                placeholder={t('enterstationname')}
                            />
            
                            <Text style={styles.inputLabel}>{t('type')}</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={editType}
                                    onValueChange={setEditType}
                                    style={styles.picker}
                                >
                                    {STATION_TYPES.map((t) => (
                                    <Picker.Item key={t} label={t} value={t} />
                                    ))}
                                </Picker>
                            </View>
                                
                            <Text style={styles.inputLabel}>{t('location')}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.locationButton}>
                                <Text style={styles.locationButtonText} numberOfLines={1}>{editAddress}</Text>
                            </TouchableOpacity>
                                
                            <Text style={styles.inputLabel}>{t('stationcontact')}</Text>
                            <TextInput
                                style={styles.input}
                                value={editContact}
                                onChangeText={setEditContact}
                                placeholder="09xxxxxxxxx"
                                placeholderTextColor={"#9CA3AF"}
                                keyboardType="phone-pad"
                                maxLength={11} // Prevents typing more than 11 characters
                            />
                            <Text style={styles.inputLabel}>Capability Level</Text>
                            <TextInput
                                style={styles.input}
                                value={editCapabilityLevel}
                                onChangeText={setEditCapabilityLevel}
                                keyboardType="numeric"
                            />
                            <Text style={styles.inputLabel}>Maximum Vehicles</Text>
                            <TextInput
                                style={styles.input}
                                value={editMaxVehicles}
                                onChangeText={setEditMaxVehicles}
                                keyboardType="numeric"
                            />
                            <Text style={styles.inputLabel}>Facebook URL</Text>
                            <TextInput
                                style={styles.input}
                                value={editFacebook}
                                onChangeText={setEditFacebook}
                                placeholder="https://facebook.com/..."
                            />
            
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.cancelButton]}
                                    onPress={() => setEditingStation(null)}
                                >
                                    <Text style={styles.actionButtonText}>{t('cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.saveButton]}
                                    onPress={saveStation}
                                >
                                    <Text style={styles.actionButtonText}>{t('savestation')}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        ) : (
                        <View>
                            <View style={styles.cardHeader}>
                                <View style={styles.iconBox}>
                                    <Icon name="office-building" size={24} color="#007BFF" />
                                </View>
                                <View style={{flex: 1, marginLeft: 10}}>
                                    <Text style={styles.stationName}>{item.name}</Text>
                                    <Text style={styles.stationType}>{item.type}</Text>
                                </View>
                            </View>
                            
                            <View style={styles.infoRow}>
                                <Icon name="identifier" size={16} color="#6B7280" />
                                <Text style={styles.infoText}>ID: {item.station_id}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Icon name="map-marker" size={16} color="#6B7280" />
                                <Text style={styles.infoText} numberOfLines={1}>{item.address}</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Icon name="phone" size={16} color="#6B7280" />
                                <Text style={styles.infoText}>{item.contact || "N/A"}</Text>
                            </View>
                        
                            <TouchableOpacity
                                style={styles.editButton}
                                onPress={() => startEdit(item)}
                            >
                                <Icon name="pencil" size={16} color="#fff" />
                                <Text style={styles.editButtonText}>{t('edit')}</Text>
                            </TouchableOpacity>
                        </View>
                        )}
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="office-building-off" size={50} color="#ccc" />
                        <Text style={styles.emptyText}>{t('nostation')}</Text>
                    </View>
                }
                />
            )}
            
            {/* Delete Screen */}
            {activeForm === "delete" && (
                <FlatList
                data={stations}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ paddingBottom: 20 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                renderItem={({ item }) => (
                    <View style={styles.stationCard}>
                        <View style={styles.cardHeader}>
                            <View style={[styles.iconBox, {backgroundColor: '#FEE2E2'}]}>
                                <Icon name="delete-alert" size={24} color="#EF4444" />
                            </View>
                            <View style={{flex: 1, marginLeft: 10}}>
                                <Text style={styles.stationName}>{item.name}</Text>
                                <Text style={styles.stationType}>{item.type}</Text>
                            </View>
                        </View>

                        <View style={styles.infoRow}>
                            <Icon name="identifier" size={16} color="#6B7280" />
                            <Text style={styles.infoText}>ID: {item.station_id}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Icon name="map-marker" size={16} color="#6B7280" />
                            <Text style={styles.infoText} numberOfLines={1}>{item.address}</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() =>
                            Alert.alert(
                                "Delete Station",
                                `${t('confirmdel')} station ${item.name} ?`,
                                [
                                { text: t('cancel'), style: "cancel" },
                                {
                                    text: t('delete'), 
                                    style: "destructive",
                                    onPress: () => deleteStation(item.id),
                                },
                                ]
                            )
                            }
                        >
                            <Icon name="trash-can" size={16} color="#fff" />
                            <Text style={styles.deleteButtonText}>{t('delete')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Icon name="office-building-off" size={50} color="#ccc" />
                        <Text style={styles.emptyText}>{t('nostation')}</Text>
                    </View>
                }
                />
            )}
        </View>
        
        {/* Map Modal */}
        <Modal visible={modalVisible} animationType="slide">
            <View style={{ flex: 1 }}>
            {loadingLocation ? (
                <ActivityIndicator size="large" style={{ flex: 1, justifyContent: "center" }} />
            ) : (
                <>
                <View style={styles.mapSearchContainer}>
                    <View style={styles.searchBox}>
                        <Icon name="magnify" size={20} color="#666" />
                        <TextInput
                            style={styles.mapSearchInput}
                            placeholder={t('searchloc')}
                            placeholderTextColor={"#888"}
                            value={searchText}
                            onChangeText={handleSearch}
                        />
                    </View>
                    {searchResults.length > 0 && (
                        <FlatList
                        data={searchResults}
                        keyExtractor={(item) => item.id}
                        style={styles.searchResultsList}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => selectSearchResult(item)}
                                style={styles.searchResultItem}
                            >
                                <Icon name="map-marker" size={16} color="#666" style={{marginRight: 8}} />
                                <Text style={styles.searchResultText}>{item.place_name}</Text>
                            </TouchableOpacity>
                        )}
                        />
                    )}
                </View>

                <MapboxGL.MapView
                    style={{ flex: 1 }}
                    onPress={(e) => {
                        const [lng, lat] = e.geometry.coordinates;
                        setMarkerCoords({ latitude: lat, longitude: lng });
                    }}
                >
                    <MapboxGL.Camera
                        zoomLevel={14}
                        centerCoordinate={[markerCoords?.longitude || 0, markerCoords?.latitude || 0]}
                    />
                    {markerCoords && (
                        <MapboxGL.PointAnnotation
                        id="marker"
                        coordinate={[markerCoords.longitude, markerCoords.latitude]}
                        />
                    )}
                </MapboxGL.MapView>

                <View style={styles.mapFooter}>
                    <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.mapButton, styles.mapCancelBtn]}>
                        <Text style={styles.mapButtonText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmLocation} style={[styles.mapButton, styles.mapConfirmBtn]}>
                        <Text style={[styles.mapButtonText, {color: '#fff'}]}>{t('confirmloc')}</Text>
                    </TouchableOpacity>
                </View>
                </>
            )}
            </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },

  // Tabs
  tabContainer: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  activeTabButton: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontWeight: "600", color: '#6B7280' },
  activeTabText: { color: '#007BFF' },

  contentContainer: { flex: 1, paddingHorizontal: 16 },

  // Form
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20
  },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, color: '#1F2937', textAlign: 'center' },
  
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#4B5563', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#F9FAFB",
    color: "#1F2937",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#F9FAFB",
    overflow: 'hidden'
  },
  picker: { height: 50, width: "100%", color: "#1F2937" },
  
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "#007BFF",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#EFF6FF",
  },
  locationButtonText: { color: "#007BFF", fontWeight: '500', flex: 1 },

  submitButton: {
    backgroundColor: "#007BFF",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    alignItems: "center",
    shadowColor: "#007BFF",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4
  },
  buttonDisabled: { opacity: 0.7 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Station List Cards
  stationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  stationName: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  stationType: { fontSize: 12, color: '#6B7280' },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { fontSize: 14, color: '#4B5563', marginLeft: 8 },

  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6
  },
  editButtonText: { color: '#fff', fontWeight: '600' },
  
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6
  },
  deleteButtonText: { color: '#fff', fontWeight: '600' },

  // Action Buttons Row
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  actionButtonText: { fontWeight: '600' },
  saveButton: { backgroundColor: '#10B981' },
  cancelButton: { backgroundColor: '#E5E7EB' },

  // Map Modal
  mapSearchContainer: { position: 'absolute', top: 50, left: 16, right: 16, zIndex: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, elevation: 4 },
  mapSearchInput: { flex: 1, height: 46, fontSize: 16, marginLeft: 8 },
  searchResultsList: { backgroundColor: '#fff', borderRadius: 8, marginTop: 6, elevation: 4 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchResultText: { color: '#333' },
  
  mapFooter: { flexDirection: 'row', padding: 16, backgroundColor: '#fff', gap: 10 },
  mapButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  mapCancelBtn: { backgroundColor: '#F3F4F6' },
  mapConfirmBtn: { backgroundColor: '#007BFF' },
  mapButtonText: { fontWeight: '600', color: '#374151' },

  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#9CA3AF', fontSize: 16, marginTop: 10 }
});