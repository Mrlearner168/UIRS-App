import { SERVER_URL } from "@env";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import axios from "axios";
import { Image as ExpoImage } from "expo-image";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import EncryptedStorage from "react-native-encrypted-storage";
import ImageViewing from "react-native-image-viewing";
import Icon from "react-native-vector-icons/MaterialIcons";

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
  const { t } = useTranslation();

  // Image Loading State
  const [imageLoadingState, setImageLoadingState] = useState({});

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
    if(!refreshing) setLoading(true);
    try {
      const res = await axios.get(`${SERVER_URL}/incidents/done/validated`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;

      const updatedData = await Promise.all(
        data.map(async (item) => {
          const mediaArray = item.media
            ? item.media.map((file) => `${SERVER_URL}${file}`)
            : [];

          let address = item.location; // fallback

          try {
            const [lat, lng] = item.location.split(",").map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
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
            }
          } catch (error) {
            // console.log("Error in reverse geocoding:", error);
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
            locationReadable: address, // safe now
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
    // Filter valid images only
    const validImages = mediaArray.map(uri => ({ uri }));
    if(validImages.length > 0){
        setSelectedMedia(validImages);
        setCurrentImageIndex(index);
        setModalVisible(true);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchIncidents();
  };

  useFocusEffect(
    useCallback(() => {
      // Optional: Refresh on focus if needed
    }, [])
  );

  // Image Handlers
  const handleImageLoad = (uri) => {
    setImageLoadingState(prev => ({ ...prev, [uri]: { loading: false, error: false } }));
  };

  const handleImageError = (uri) => {
    setImageLoadingState(prev => ({ ...prev, [uri]: { loading: false, error: true } }));
  };

  const renderCard = ({ item }) => {
      const dateStr = new Date(item.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });

      return (
        <View style={styles.card}>
            {/* Header */}
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <View style={styles.iconCircle}>
                        <Icon name="update" size={24} color="#007BFF" />
                    </View>
                    <View style={{marginLeft: 10, flex: 1}}>
                        <Text style={styles.title}>{item.subType || item.type}</Text>
                        <Text style={styles.dateText}>{dateStr}</Text>
                    </View>
                </View>
            </View>

            {/* Body */}
            <View style={styles.cardBody}>
                <View style={styles.infoRow}>
                    <Icon name="location-on" size={18} color="#6B7280" style={{marginTop: 2}} />
                    <Text style={styles.infoText}>{item.locationReadable}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Icon name="access-time" size={18} color="#6B7280" />
                    <Text style={styles.infoText}>{t('reportedtime')} {item.time}</Text>
                </View>

                {item.adminRemarks && (
                    <View style={styles.remarksContainer}>
                        <Text style={styles.remarksLabel}>{t('description') || "Update Details"}:</Text>
                        <Text style={styles.remarksText}>{item.adminRemarks}</Text>
                    </View>
                )}
            </View>

            {/* Media */}
            {item.media && item.media.length > 0 && (
                <View style={styles.mediaSection}>
                    <Text style={styles.mediaTitle}>{t('media') || "Attached Media"}</Text>
                    <View style={styles.mediaGrid}>
                        {item.media.map((mediaItem, index) => {
                            const imgState = imageLoadingState[mediaItem] || { loading: true, error: false };
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.imageWrapper}
                                    onPress={() => openImageModal(item.media, index)}
                                >
                                    {imgState.loading && (
                                        <View style={styles.loadingOverlay}>
                                            <ActivityIndicator size="small" color="#007BFF" />
                                        </View>
                                    )}
                                    <ExpoImage
                                        source={{ uri: mediaItem }}
                                        style={styles.image}
                                        contentFit="cover"
                                        //for production 
                                        //cachePolicy="memory-disk"
                                        cachePolicy="none"
                                        onLoad={() => handleImageLoad(mediaItem)}
                                        onError={() => handleImageError(mediaItem)}
                                    />
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            )}
        </View>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
          <Text style={styles.heading}>{t('updates')}</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('loading') || "Loading Updates..."}</Text>
        </View>
      ) : (
        <FlatList
            data={incidents}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Icon name="check-circle-outline" size={60} color="#D1D5DB" />
                <Text style={styles.emptyText}>{t('novalidatedinfo') || "No updates available."}</Text>
            </View>
            }
            renderItem={renderCard}
        />
      )}

      <ImageViewing
        images={selectedMedia}
        imageIndex={currentImageIndex}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
        onImageIndexChange={(index) => setCurrentImageIndex(index)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  
  // Header
  headerContainer: { padding: 22, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  heading: { fontSize: 24, fontWeight: "700", color: "#1F2937" , textAlign: 'center'  },

  // Loading & Empty
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: '#6B7280' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 16, color: '#9CA3AF' },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 10
  },
  
  // Card Header
  cardHeader: { marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  dateText: { fontSize: 13, color: '#6B7280', marginTop: 2 },

  // Card Body
  cardBody: { marginBottom: 16 },
  infoRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  infoText: { fontSize: 16, color: '#4B5563', marginLeft: 8, flex: 1, lineHeight: 20 },
  
  remarksContainer: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, marginTop: 8 },
  remarksLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' },
  remarksText: { fontSize: 15, color: '#1F2937', lineHeight: 22 },

  // Media
  mediaSection: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  mediaTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase' },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imageWrapper: { position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  image: { width: 160, height: 160 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
});