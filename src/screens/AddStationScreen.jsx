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

  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(STATION_TYPES[0]);
  const [addressSelected, setAddressSelected] = useState("Select Location");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [contact, setContact] = useState("");
  const [facebook, setFacebook] = useState("");
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
  const [editingStation, setEditingStation] = useState(null); 
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStations();
    setId("");
    setName("");
    setType(STATION_TYPES[0]);
    setAddressSelected("Select Location");
    setLatitude(null);
    setLongitude(null);
    setContact("");
    setFacebook("");
    setSubmitting(false);
    setSearchText("");
    setSearchResults([]);
    setTimeout(() => setRefreshing(false), 500);
  }, [token]);

   const startEdit = (station) => {
    setEditingStation(station.id); // keep backend id for update
    setStationId(station.station_id); // editable
    setName(station.name);
    setType(station.type);
    setAddressSelected(station.address);
    setLatitude(station.latitude);
    setLongitude(station.longitude);
    setContact(station.contact || "");
    setFacebook(station.facebook || "");
    setMarkerCoords({ latitude: station.latitude, longitude: station.longitude });
  };


  const openModal = () => {
    if (!markerCoords) {
      return Alert.alert(t('locnotready'));
    }
    setModalVisible(true);
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
    const [lng, lat] = feature.center;
    setMarkerCoords({ latitude: lat, longitude: lng });
    setAddressSelected(feature.place_name);
    setSearchResults([]);
  };

  const confirmLocation = () => {
    if (markerCoords) {
      setLatitude(markerCoords.latitude);
      setLongitude(markerCoords.longitude);
      setAddressSelected(
        `Lat: ${markerCoords.latitude.toFixed(5)}, Lng: ${markerCoords.longitude.toFixed(5)}`
      );
    }
    setModalVisible(false);
  };

  const validate = () => {
    if (!id.trim()) return "Station ID is required";
    if (!name.trim()) return "Name is required";
    if (!latitude || !longitude) return "Location not selected";
    if (contact && !/^(09|\+639)\d{9}$/.test(contact.trim())) return "Invalid contact number";
    return null;
  };

   const saveStation = async () => {
    if (!name.trim() || !latitude || !longitude)
      return Alert.alert(t('namelocrequired'));

    try {
      let readableAddress = addressSelected;
      if (latitude && longitude) {
        const geoRes = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
          { params: { access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN } }
        );
        if (geoRes.data.features.length > 0)
          readableAddress = geoRes.data.features[0].place_name;
      }

      await axios.put(`${SERVER_URL}/stations_update/${editingStation}`, {
        station_id: stationId.trim(),
        name: name.trim(),
        type,
        address: readableAddress,
        latitude,
        longitude,
        contact: contact.trim() || null,
        facebook: facebook.trim() || null,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert(t('stationupdated'));
      setEditingStation(null);
      fetchStations();
    } catch (err) {
      Alert.alert(t('stationfailed'));
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
    const err = validate();
    if (err) return Alert.alert(err);
    if (!token) return Alert.alert("Token missing, please login again");

    setSubmitting(true);

    try {
      let check;
      try {
        check = await axios.get(`${SERVER_URL}/stations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        throw e;
      }

      if (check.data.some((station) => station.id === Number(id))) {
        Alert.alert(t('dupstationid'));
        setSubmitting(false);
        return;
      }

      if (contact && check.data.some((station) => station.contact === contact.trim())) {
        Alert.alert(t('dupcontact'));
        setSubmitting(false);
        return;
      }

      let readableAddress = addressSelected;
      if (latitude && longitude) {
        try {
          const geoRes = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
            { params: { access_token: RNMAPBOX_MAPS_DOWNLOAD_TOKEN } }
          );
          if (geoRes.data.features && geoRes.data.features.length > 0) {
            readableAddress = geoRes.data.features[0].place_name;
          }
        } catch (e) {
          console.log("Reverse geocode failed:", e);
        }
      }

      const payload = {
        station_id: id,
        name: name.trim(),
        type,
        address: readableAddress,
        latitude,
        longitude,
        contact: contact.trim() || null,
        facebook: facebook.trim() || null,
      };

      try {
        const res = await axios.post(`${SERVER_URL}/addstation`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert(`Station saved: ID ${res.data?.id || "(created)"}`);
        onRefresh();
      } catch (e) {
        throw e;
      }
    } catch (err) {
      Alert.alert(err.response?.data?.error || err.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };
  

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
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListHeaderComponent={
                    <View style={styles.formCard}>
                    <Text style={styles.cardTitle}>{t('addstation')}</Text>
                
                    <Text style={styles.inputLabel}>{t('stationid')}</Text>
                    <TextInput
                        style={styles.input}
                        value={id}
                        onChangeText={setId}
                        placeholder="e.g 1234"
                        placeholderTextColor={"#9CA3AF"}
                        keyboardType="numeric"
                    />
            
                    <Text style={styles.inputLabel}>{t('stationname')}</Text>
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder={t('enterstationname')}
                        placeholderTextColor={"#9CA3AF"}
                    />
            
                    <Text style={styles.inputLabel}>{t('type')}</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={type} onValueChange={setType} style={styles.picker}>
                        {STATION_TYPES.map((t) => (
                            <Picker.Item key={t} label={t} value={t} />
                        ))}
                        </Picker>
                    </View>
                        
                    <Text style={styles.inputLabel}>{t('stationaddress')}</Text>
                    <TouchableOpacity onPress={openModal} style={styles.locationButton}>
                        <Icon name="map-marker" size={20} color="#007BFF" style={{marginRight: 8}} />
                        <Text style={styles.locationButtonText} numberOfLines={1}>{addressSelected}</Text>
                    </TouchableOpacity>
                        
                    <Text style={styles.inputLabel}>{t('stationcontact')}</Text>
                    <TextInput
                        style={styles.input}
                        value={contact}
                        onChangeText={setContact}
                        placeholder="09xxxxxxxxx"
                        placeholderTextColor={"#9CA3AF"}
                        keyboardType="phone-pad"
                    />
            
                    <Text style={styles.inputLabel}>Facebook URL (Optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={facebook}
                        onChangeText={setFacebook}
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
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                renderItem={({ item }) => (
                    <View style={styles.stationCard}>
                        {editingStation === item.id ? (
                        <View>
                            <Text style={styles.cardTitle}>{t('updatestation')}</Text>
                            
                            <Text style={styles.inputLabel}>{t('stationid')}</Text>
                            <TextInput
                                style={styles.input}
                                value={stationId}
                                onChangeText={setStationId}
                                placeholder={t('enterstationid')}
                            />
            
                            <Text style={styles.inputLabel}>{t('stationname')}</Text>
                            <TextInput
                                style={styles.input}
                                value={name}
                                onChangeText={setName}
                                placeholder={t('enterstationname')}
                            />
            
                            <Text style={styles.inputLabel}>{t('type')}</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={type}
                                    onValueChange={setType}
                                    style={styles.picker}
                                >
                                    {STATION_TYPES.map((t) => (
                                    <Picker.Item key={t} label={t} value={t} />
                                    ))}
                                </Picker>
                            </View>
                                
                            <Text style={styles.inputLabel}>{t('location')}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.locationButton}>
                                <Text style={styles.locationButtonText} numberOfLines={1}>{addressSelected}</Text>
                            </TouchableOpacity>
                                
                            <Text style={styles.inputLabel}>{t('stationcontact')}</Text>
                            <TextInput
                                style={styles.input}
                                value={contact}
                                onChangeText={setContact}
                                placeholder="09xxxxxxxxx"
                            />
            
                            <Text style={styles.inputLabel}>Facebook URL</Text>
                            <TextInput
                                style={styles.input}
                                value={facebook}
                                onChangeText={setFacebook}
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