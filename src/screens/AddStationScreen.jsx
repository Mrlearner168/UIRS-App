import { MAPBOX_TOKEN, SERVER_URL } from "@env";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import MapboxGL from "@rnmapbox/maps";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";

MapboxGL.setAccessToken(MAPBOX_TOKEN);

const STATION_TYPES = ["BFP", "PNP", "Ambulance", "Rescuer"];

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

  //fetch stations for delete
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem("token");
        if (storedToken) {
          setToken(storedToken);
          console.log("Token found:", storedToken);
        } else {
          console.log("Token not found, navigating to Login");
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
          console.log("Location permission denied");
          Alert.alert("Permission denied", "Enable location to pick coordinates");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setMarkerCoords(coords);
        setLoadingLocation(false);
      } catch (e) {
        console.log("Error getting location:", e);
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
      //console.log("Stations fetched", res.data);
    } catch (err) {
      console.log(err);
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
      console.log("Marker coordinates not ready");
      return Alert.alert("Location not ready");
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
        { params: { access_token: MAPBOX_TOKEN, limit: 5, types: "poi,address,place,locality" } }
      );
      setSearchResults(res.data.features || []);
    } catch (e) {
      console.log("Search failed:", e);
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
    } else {
      console.log("Cannot confirm location, markerCoords is null");
    }
    setModalVisible(false);
  };

  const validate = () => {
    if (!id.trim()) return "Station ID is required";
    if (!id || id.trim() === "") return "ID is required";
    if (!name.trim()) return "Name is required";
    if (!latitude || !longitude) return "Location not selected";
    if (contact && !/^(09|\+639)\d{9}$/.test(contact.trim())) return "Invalid contact number";
    if (!type) return "Type is required";
    return null;
  };

   const saveStation = async () => {
    if (!name.trim() || !latitude || !longitude)
      return Alert.alert("Name and Location required");

    try {
      let readableAddress = addressSelected;
      if (latitude && longitude) {
        const geoRes = await axios.get(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
          { params: { access_token: MAPBOX_TOKEN } }
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
      Alert.alert("Station updated");
      setEditingStation(null);
      fetchStations();
    } catch (err) {
      console.error(err);
      Alert.alert("Update failed", err.response?.data?.error || err.message);
    }
  };
  
  const deleteStation = async (stationId) => {
    try {
      await axios.delete(`${SERVER_URL}/stations_delete/${stationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      Alert.alert("Station deleted");
      console.log("station_id:" , stationId);
      fetchStations();
    } catch (err) {
      console.log(err);
      console.log("station_id:" , stationId);
      Alert.alert("Delete failed", err.response?.data?.error || err.message);
    }
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      console.log("Validation failed:", err);
      return Alert.alert(err);
    }
    if (!token) {
      console.log("Token missing during submit");
      return Alert.alert("Token missing, please login again");
    }

    setSubmitting(true);

    try {
      let check;
      try {
        check = await axios.get(`${SERVER_URL}/stations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.log("Failed to fetch existing stations:", e);
        throw e;
      }

      if (check.data.some((station) => station.id === Number(id))) {
        console.log("Duplicate ID found");
        Alert.alert("Station ID already exists");
        setSubmitting(false);
        return;
      }

      if (contact && check.data.some((station) => station.contact === contact.trim())) {
        console.log("Duplicate contact found");
        Alert.alert("Contact number already exists");
        setSubmitting(false);
        return;
      }

      let readableAddress = addressSelected;
      if (latitude && longitude) {
        try {
          const geoRes = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`,
            { params: { access_token: MAPBOX_TOKEN } }
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

      console.log("Submitting payload:", payload);

      try {
        const res = await axios.post(`${SERVER_URL}/addstation`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("Submit success:", res.data);
        Alert.alert(`Station saved: ID ${res.data?.id || "(created)"}`);
        onRefresh();
      } catch (e) {
        console.log("Submit failed:", e.response?.data || e.message);
        throw e;
      }
    } catch (err) {
      console.log("Error during handleSubmit:", err);
      Alert.alert(err.response?.data?.error || err.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };
  


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >

      {/* Toggle Buttons */}
      <View style={styles.switcher}>
        {["add", "edit", "delete"].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.switchButton,
                activeForm === type && styles.activeSwitchButton,
              ]}
              onPress={() => setActiveForm(type)}
            >
              <Text
                style={{
                  color: activeForm === type ? "#fff" : "#000",
                  fontWeight: "bold",
                }}
              >
                {type.toUpperCase()}
              </Text>
            </TouchableOpacity>
        ))}
      </View>
      {/* Add Station Screen */}
      {activeForm === "add" && (
        <FlatList
          data={stations}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <>
              <Text style={styles.title}>Add Station</Text>
          
              <Text style={styles.label}>Station ID</Text>
              <TextInput
                style={styles.input}
                value={id}
                onChangeText={setId}
                placeholder="e.g 1234"
              />
      
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Station Name"
              />
      
              <Text style={styles.label}>Type</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={type} onValueChange={setType} style={styles.picker}>
                  {STATION_TYPES.map((t) => (
                    <Picker.Item key={t} label={t} value={t} />
                  ))}
                </Picker>
              </View>
                
              <Text style={styles.label}>Location</Text>
              <TouchableOpacity onPress={openModal}>
                <TextInput
                  style={[styles.input, styles.readonly]}
                  value={addressSelected}
                  editable={false}
                />
              </TouchableOpacity>
                
              <Text style={styles.label}>Contact</Text>
              <TextInput
                style={styles.input}
                value={contact}
                onChangeText={setContact}
                placeholder="09xxxxxxxxx"
              />
      
              <Text style={styles.label}>Facebook URL (Optional)</Text>
              <TextInput
                style={styles.input}
                value={facebook}
                onChangeText={setFacebook}
                autoCapitalize="none"
                placeholder="https://facebook.com/yourpage"
              />
      
              <TouchableOpacity
                style={[styles.button, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                <Text style={styles.buttonText}>
                  {submitting ? "Submitting..." : "Save Station"}
                </Text>
              </TouchableOpacity>
            </>
          }
        />
      )}
      
      {/*Edit Screen*/}
      {activeForm === "edit" && (
        <>
          <FlatList
            data={stations}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                  {editingStation === item.id ? (
                    <>
                      <Text style={styles.title}>Update Station</Text>
                      <Text style={styles.label}>Station ID</Text>
                      <TextInput
                        style={styles.input}
                        value={stationId}
                        onChangeText={setStationId}
                        placeholder="Enter Station ID"
                      />
        
                      <Text style={styles.label}>Name</Text>
                      <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder="Station Name"
                      />
        
                      <Text style={styles.label}>Type</Text>
                      <View style={styles.pickerWrap}>
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
                        
                      <Text style={styles.label}>Location</Text>
                      <TouchableOpacity onPress={() => setModalVisible(true)}>
                        <TextInput
                          style={[styles.input, styles.readonly]}
                          value={addressSelected}
                          editable={false}
                        />
                      </TouchableOpacity>
                        
                      <Text style={styles.label}>Contact</Text>
                      <TextInput
                        style={styles.input}
                        value={contact}
                        onChangeText={setContact}
                        placeholder="09xxxxxxxxx"
                      />
        
                      <Text style={styles.label}>Facebook URL</Text>
                      <TextInput
                        style={styles.input}
                        value={facebook}
                        onChangeText={setFacebook}
                        placeholder="https://facebook.com/..."
                      />
        
                      <View style={{ flexDirection: "row", marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.button, { flex: 1, marginRight: 5 }]}
                          onPress={saveStation}
                        >
                          <Text style={styles.buttonText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.button,
                            { flex: 1, backgroundColor: "gray" },
                          ]}
                          onPress={() => setEditingStation(null)}
                        >
                          <Text style={styles.buttonText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.text}>Station ID: {item.station_id}</Text>
                      <Text style={styles.text}>Name: {item.name}</Text>
                      <Text style={styles.text}>Type: {item.type}</Text>
                      <Text style={styles.text}>Address: {item.address}</Text>
                      <Text style={styles.text}>Contact: {item.contact}</Text>
                  
                      <TouchableOpacity
                        style={[styles.button, { marginTop: 8 }]}
                        onPress={() => startEdit(item)}
                      >
                        <Text style={styles.buttonText}>Edit</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: "center", marginTop: 50 }}>
                <Text style={{ fontSize: 16, color: "gray" }}>
                  No stations available
                </Text>
              </View>
            }
          />
        </>
      )}
      
      {/*Delete Screen*/}
      {activeForm === "delete" && (
        <>
          <FlatList
            data={stations}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={{ padding: 16 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.text}>Station ID: {item.station_id}</Text>
                  <Text style={styles.text}>Name: {item.name}</Text>
                  <Text style={styles.text}>Type: {item.type}</Text>
                  <Text style={styles.text}>Address: {item.address}</Text>
                  <Text style={styles.text}>Contact: {item.contact}</Text>

                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: "#e63946" }]}
                    onPress={() =>
                      Alert.alert(
                        "Delete Station",
                        `Are you sure you want to delete "${item.name}"?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => deleteStation(item.id),
                          },
                        ]
                      )
                    }
                  >
                    <Text style={styles.buttonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
            )}
            ListEmptyComponent={
              <View style={{ alignItems: "center", marginTop: 50 }}>
                <Text style={{ fontSize: 16, color: "gray" }}>
                  No stations available
                </Text>
              </View>
            }
          />
        </>
      )}
      
      {/*location modal*/}
      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1 }}>
          {loadingLocation ? (
            <ActivityIndicator size="large" style={{ flex: 1, justifyContent: "center" }} />
          ) : (
            <>
              <View style={{ padding: 10, backgroundColor: "#fff", zIndex: 10 }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      fontSize: 16,
                      backgroundColor: "#fafafa",
                    }}
                    placeholder="Search location..."
                    value={searchText}
                    onChangeText={handleSearch}
                    />
                  {searchResults.length > 0 && (
                    <FlatList
                    data={searchResults}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 150, marginTop: 5 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                          onPress={() => selectSearchResult(item)}
                          style={{ paddingVertical: 8, paddingHorizontal: 5, borderBottomWidth: 1, borderColor: "#eee" }}
                          >
                          <Text>{item.place_name}</Text>
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
              <TouchableOpacity onPress={confirmLocation} style={styles.button}>
                  <Text style={styles.buttonText}>Confirm Location</Text>
              </TouchableOpacity>
              <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  style={[styles.button, { backgroundColor: "#aaa" }]}
                  >
                  <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  label: { fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fafafa",
  },
  readonly: { backgroundColor: "#f0f0f0", color: "#555" },
  pickerWrap: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fafafa",
  },
  picker: { height: 50 },
  button: {
    backgroundColor: "#0a7",
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 5,
    marginBottom: 10,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  map: { flex: 1, width: Dimensions.get("window").width, height: 400 },
  switcher: {
  flexDirection: "row",
  justifyContent: "space-around",
  marginBottom: 15,
  marginTop: 20,
},
switchButton: {
  backgroundColor: "#ddd",
  paddingVertical: 12,
  paddingHorizontal: 20,
  borderRadius: 20,
},
activeSwitchButton: {
  backgroundColor: "#007bff",
},

});
