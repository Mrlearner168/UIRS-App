import { SERVER_URL } from "@env";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";

const PLACEHOLDER_URI = "https://via.placeholder.com/150";

export default function UpdatesScreen() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState("");
  const navigation = useNavigation();
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalVisible, setModalVisible] = useState(false);


  // fetch token
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
        console.log("Error fetching token:", error);
      }
    };
    fetchToken();
  }, []);

  useEffect(()=>{
    if (token) {
      fetchIncidents();
    }
  },[token]);
  

  const fetchIncidents = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/incidents/done/validated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      console.log("Fetched incidents:", data);

      const updatedData = await Promise.all(
        data.map(async (item) => {
          const mediaArray = item.media
            ? item.media.map((file) => `${SERVER_URL}${file}`)
            : [];

          let address = item.location; // fallback

          try {
            const [lat, lng] = item.location.split(",").map(Number);
            const reverseGeocode = await Location.reverseGeocodeAsync({
              latitude: lat,
              longitude: lng,
            });

            if (reverseGeocode && reverseGeocode[0]) {
              const g = reverseGeocode[0];
              address = [g.street, g.city, g.region, g.country]
                .filter(Boolean)
                .join(", ");
            }
          } catch (error) {
            console.log("Error in reverse geocoding:", error);
          }

          return {
            id: item.id,
            type: item.incidentType,
            subType: item.subType,
            time: item.incidentTime,
            description: item.incidentDescription,
            contact: item.contactInfo,
            adminRemarks: item.adminRemarks,
            status: item.status,
            validated: item.validated,
            created_at: item.created_at,
            location: item.location,
            locationReadable: item.processLocation, // safe now
            media: mediaArray,
          };
        })
      );

      setIncidents(updatedData);
    } catch (err) {
      console.log("Error fetching incidents:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };


  const openImageModal = (mediaArray, index) => {
    setSelectedMedia(mediaArray);
    setCurrentImageIndex(index);
    setModalVisible(true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchIncidents().finally(() => setRefreshing(false));
  };

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener("tabPress", () => {
        console.log("Tab pressed: refreshing data");
        onRefresh();
      });

      return () => unsubscribe();
    }, [navigation, onRefresh])
  );


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading Updates.....</Text>
      </View>
    );
  }
  console.log("incidents: ", incidents);

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.heading}>Updates</Text>
      <FlatList
        data={incidents}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text>No validated reports available.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.subType}</Text>
            {item.adminRemarks ? (
              <Text style={styles.remarks}>
                Incident Description: {item.adminRemarks}
              </Text>
            ) : null}
            <Text style={styles.text}>
              Location: {item.locationReadable}
            </Text>
            <Text style={styles.text}>Reported Time: {item.time}</Text>
            <Text style={styles.date}>
              Created at:{' '}
              {new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
                year: 'numeric',
              })}
            </Text>
            <View style={styles.mediaContainer}>
              {item.media && item.media.length > 0 ? (
                item.media.map((mediaItem, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => openImageModal(item.media, index)}
                  >
                    <Image
                      source={{ uri: mediaItem }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  onPress={() => openImageModal([PLACEHOLDER_URI], 0)}
                >
                  <Image
                    source={{ uri: PLACEHOLDER_URI }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />
       <ImageViewing
        images={selectedMedia.map((uri) => ({ uri }))}
        imageIndex={currentImageIndex}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
        onImageIndexChange={(index) => setCurrentImageIndex(index)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 5,
    marginTop: 20,
    textAlign: "center",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#f8f8f8",
    padding: 12,
    marginBottom: 12,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 6 },
  text: { fontSize: 14, marginBottom: 4 },
  remarks: {
    fontSize: 16,
    marginTop: 6,
    marginBottom: 10,
    fontStyle: "italic",
    color: "darkred",
  },
  date: { fontSize: 12, marginTop: 6, color: "gray" },
  mediaContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 8,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
});
