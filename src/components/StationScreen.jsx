import { SERVER_URL } from "@env";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';

export default function StationScreen() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [token, setToken] = useState(null);

  const fetchStations = async () => {
    try {
      // 1. Get your token from wherever you stored it during login
      const token = await EncryptedStorage.getItem('token'); 
      setToken(token);

      const response = await fetch(`${SERVER_URL}/stations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // This is what @jwt_required() looks for
        },
      });

      if (!response.ok) {
          const errorData = await response.json();
          console.error("Server Error:", errorData);
          throw new Error("Failed to fetch");
      }

      const data = await response.json();
      setStations(data);
    } catch (err) {
      console.warn("Fetch failed:", err.message);
    } finally {
      setLoading(false);
    }
  };

  console.log("SERVER_URL:", SERVER_URL); // Debugging line
  console.log("Fetched Stations:", stations); // Debugging line
  console.log("Token:", token); // Debugging line
  useEffect(() => {
    fetchStations();
  }, []);

  const handleOpenModal = (station) => {
    setSelectedStation(station);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Smooth transition: clear data after modal closes
    setTimeout(() => setSelectedStation(null), 300);
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loaderText}>Loading Stations...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="train" size={32} color="#4f46e5" />
          <Text style={styles.headerTitle}>Station Directory</Text>
        </View>
        <Text style={styles.headerSubtitle}>Find locations and contact info.</Text>
      </View>

      <FlatList
        data={stations}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => handleOpenModal(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{item.name}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.type || 'Station'}</Text>
              </View>
            </View>
            <View style={styles.cardLocationRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color="#64748b" />
              <Text style={styles.cardAddress} numberOfLines={1}>{item.address}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <StationModal 
        isOpen={isModalOpen} 
        station={selectedStation} 
        onClose={handleCloseModal} 
      />
    </SafeAreaView>
  );
}

const StationModal = memo(({ isOpen, station, onClose }) => {
  if (!station) return null;

  const openMaps = () => {
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${station.latitude},${station.longitude}`;
    const label = station.name;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`
    });
    Linking.openURL(url);
  };

  const openPhone = () => {
    if (station.contact) Linking.openURL(`tel:${station.contact}`);
  };

  const openFacebook = () => {
    if (station.facebook) Linking.openURL(station.facebook);
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.modalContent}>
          
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color="white" />
            </TouchableOpacity>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>🚆 {station.type || 'Station'}</Text>
            </View>
            <Text style={styles.modalTitle}>{station.name}</Text>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Location Section */}
            <View style={styles.infoRow}>
              <View style={[styles.iconBox, { backgroundColor: '#f5f3ff' }]}>
                <MaterialCommunityIcons name="map-marker" size={24} color="#4f46e5" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>LOCATION</Text>
                <Text style={styles.infoValue}>{station.address}</Text>
                <TouchableOpacity style={styles.directionButton} onPress={openMaps}>
                  <MaterialCommunityIcons name="navigation-variant" size={18} color="#4f46e5" />
                  <Text style={styles.directionButtonText}>Get Directions</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.separator} />

            {/* Contact Section */}
            <View style={styles.infoRow}>
              <View style={[styles.iconBox, { backgroundColor: '#ecfdf5' }]}>
                <MaterialCommunityIcons name="phone" size={24} color="#059669" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>CONTACT SUPPORT</Text>
                {station.contact ? (
                  <TouchableOpacity onPress={openPhone}>
                    <Text style={styles.phoneText}>{station.contact}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noneText}>Not available</Text>
                )}
              </View>
            </View>

            {station.facebook && (
              <>
                <View style={styles.separator} />
                <View style={styles.infoRow}>
                  <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                    <MaterialCommunityIcons name="facebook" size={24} color="#2563eb" />
                  </View>
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoLabel}>SOCIAL MEDIA</Text>
                    <TouchableOpacity onPress={openFacebook} style={styles.fbLink}>
                      <Text style={styles.fbLinkText}>Visit Facebook Page</Text>
                      <MaterialCommunityIcons name="open-in-new" size={14} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            <View style={styles.coordBox}>
              <Text style={styles.coordText}>
                COORD: {station.latitude?.toFixed(4)}, {station.longitude?.toFixed(4)}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeActionBtn} onPress={onClose}>
              <Text style={styles.closeActionBtnText}>Close Details</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loaderText: {
    marginTop: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f172a',
    marginLeft: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
  },
  badge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  cardLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAddress: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 6,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#4f46e5',
    padding: 32,
    paddingTop: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 20,
  },
  modalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  modalBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  modalTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
  },
  modalBody: {
    padding: 24,
  },
  infoRow: {
    flexDirection: 'row',
    marginVertical: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 22,
    fontWeight: '500',
  },
  directionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 12,
  },
  directionButtonText: {
    color: '#4f46e5',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 6,
  },
  phoneText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
  },
  noneText: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  separator: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  fbLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fbLinkText: {
    color: '#2563eb',
    fontWeight: 'bold',
    marginRight: 4,
  },
  coordBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  coordText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    color: '#94a3b8',
  },
  closeActionBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  closeActionBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});