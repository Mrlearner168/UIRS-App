import { SERVER_URL } from '@env';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import ImageViewing from 'react-native-image-viewing';
import Icon from 'react-native-vector-icons/MaterialIcons';

const NewUserValidation = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState(null);
  
  // Image Viewer State
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [imageLoadingState, setImageLoadingState] = useState({});
  
  const { t } = useTranslation();
  const pendingRequestsRef = useRef({}); 

  // Image loading and error handling
  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: false, loaded: true }
    }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: true, loaded: false }
    }));
    delete pendingRequestsRef.current[uri];
  }, []);

  const setImageLoading = useCallback((uri, loading) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { ...prev[uri], loading }
    }));
  }, []);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        if (storedToken) {
          setToken(storedToken);
        } else {
          navigation.navigate("Login");
        }
      } catch (error) {
        console.log('Error fetching token:', error);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (token) {
      fetchNewUsers();
    }
  }, [token]);

  const fetchNewUsers = async () => {
    if (!token) return;
    if (!refreshing) setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/users_data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const pendingUsers = data.filter(user => user.status === 'inactive');
      setUsers(pendingUsers);
    } catch (error) {
      Alert.alert('Error', t('failedtofetch') || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNewUsers();
    setRefreshing(false);
  };

  const confirmAction = (userId, action) => {
    const isValidate = action === 'validate';
    Alert.alert(
      isValidate ? "Confirm Validation" :  "Confirm Decline",
      isValidate 
        ?  "Are you sure you want to activate this user?" 
        : "Are you sure you want to decline this user?",
      [
        { text: t('cancel'), style: 'cancel' },
        { 
          text: isValidate ? t('validate') || "Validate" : t('decline') || "Decline", 
          style: isValidate ? 'default' : 'destructive',
          onPress: () => isValidate ? validateUser(userId) : declineUser(userId)
        }
      ]
    );
  };

  const validateUser = async (userId) => {
    if (!token) return;
    try {
      const response = await fetch(`${SERVER_URL}/toggle_user_status/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });

      if (response.ok) {
        Alert.alert('Success', t('validatedsuccessfully'));
        fetchNewUsers();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to validate user.');
      }
    } catch (error) {
      Alert.alert('Error', t('errorval'));
    }
  };

  const declineUser = async (userId) => {
    if (!token) return;
    try {
      const response = await fetch(`${SERVER_URL}/toggle_user_status/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'declined' }),
      });

      if (response.ok) {
        Alert.alert('Declined', t('userdeclined'));
        fetchNewUsers();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to decline user.');
      }
    } catch (error) {
      Alert.alert('Error', t('errorwhiledec'));
    }
  };

  const openImageViewer = (images, index) => {
    const validImages = images.filter(img => img.uri);
    if(validImages.length > 0) {
        setViewerImages(validImages);
        setViewerIndex(index);
        setImageViewerVisible(true);
    }
  };

  const renderImageWithLoader = (uri, label, allImages, index) => {
    if (!uri) return (
        <View style={styles.imagePlaceholder}>
            <Icon name="image-not-supported" size={30} color="#ccc" />
            <Text style={styles.noImageText}>{t('noimage')}</Text>
        </View>
    );

    const imageState = imageLoadingState[uri] || { loading: true, error: false };

    return (
        <View style={styles.imageItemContainer}>
            <Text style={styles.imageLabel}>{label}</Text>
            <TouchableOpacity 
                style={styles.imageWrapper}
                onPress={() => openImageViewer(allImages, index)}
            >
                {imageState.loading && (
                    <View style={styles.imageLoadingContainer}>
                        <ActivityIndicator size="small" color="#007BFF" />
                    </View>
                )}
                {imageState.error ? (
                    <View style={[styles.image, styles.imageError]}>
                        <Icon name="broken-image" size={30} color="#999" />
                        <Text style={{fontSize: 10, color: '#999'}}>Error</Text>
                    </View>
                ) : (
                    <ExpoImage 
                        source={{ uri }}
                        style={styles.image}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        onLoad={() => handleImageLoad(uri)}
                        onError={() => handleImageError(uri)}
                        onLoadStart={() => setImageLoading(uri, true)}
                    />
                )}
            </TouchableOpacity>
        </View>
    );
  };

  const renderUser = ({ item }) => {
    const images = [
      { uri: item.id_front_path },
      { uri: item.id_back_path },
      { uri: item.selfie_path },
    ].filter(img => img.uri);

    return (
      <View style={styles.userCard}>
        {/* Header Section */}
        <View style={styles.cardHeader}>
            <View style={styles.headerInfo}>
                <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{t('pending') || "Pending"}</Text>
                </View>
            </View>
        </View>

        {/* Contact Info */}
        <View style={styles.infoSection}>
            <View style={styles.infoRow}>
                <Icon name="email" size={18} color="#6B7280" style={{marginRight: 8}} />
                <Text style={styles.infoText}>{item.email}</Text>
            </View>
            <View style={styles.infoRow}>
                <Icon name="phone" size={18} color="#6B7280" style={{marginRight: 8}} />
                <Text style={styles.infoText}>{item.phone}</Text>
            </View>
        </View>

        {/* Credentials Section */}
        <View style={styles.credentialsSection}>
          <Text style={styles.sectionTitle}>{t('credentials') || "Credentials"}</Text>
          
          <View style={styles.idDetailsRow}>
             <View style={styles.idDetailItem}>
                <Text style={styles.detailLabel}>{t('idtype')}</Text>
                <Text style={styles.detailValue}>{item.id_type}</Text>
             </View>
             <View style={styles.idDetailItem}>
                <Text style={styles.detailLabel}>{t('idnumber')}</Text>
                <Text style={styles.detailValue}>{item.id_number}</Text>
             </View>
          </View>

          <View style={styles.imagesContainer}>
             {renderImageWithLoader(item.id_front_path, t('idcardfront'), images, 0)}
             {renderImageWithLoader(item.id_back_path, t('idcardback'), images, 1)}
             {renderImageWithLoader(item.selfie_path, t('selfie'), images, 2)}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => confirmAction(item.id, 'decline')}
          >
            <Icon name="close" size={20} color="#fff" />
            <Text style={styles.buttonText}>{t('declinerequest')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => confirmAction(item.id, 'validate')}
          >
            <Icon name="check" size={20} color="#fff" />
            <Text style={styles.buttonText}>{t('acceptrequest')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {loading && !refreshing ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderUser}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="verified-user" size={60} color="#D1D5DB" />
              <Text style={styles.emptyText}>{t('nopendingusers') || "No pending validations"}</Text>
            </View>
          }
        />
      )}

      <ImageViewing
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={imageViewerVisible}
        onRequestClose={() => setImageViewerVisible(false)}
        presentationStyle="overFullScreen"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  headerContainer: { padding: 22, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 16 },

  // User Card
  userCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  
  // Header
  cardHeader: { marginBottom: 12 },
  headerInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userName: { fontSize: 20, fontWeight: '700', color: '#1F2937' },
  statusBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#D97706', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  
  // Info Section
  infoSection: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { color: '#4B5563', fontSize: 15 },

  // Credentials
  credentialsSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 },
  
  idDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8 },
  idDetailItem: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1F2937' },

  // Images
  imagesContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  imageItemContainer: { flex: 1, alignItems: 'center' },
  imageLabel: { fontSize: 12, color: '#6B7280', marginBottom: 6, fontWeight: '500' },
  imageWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10 },
  noImageText: { fontSize: 10, color: '#9CA3AF', marginTop: 4 },
  
  imageLoadingContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 10
  },
  imageError: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF2F2' },

  // Actions
  actionButtonsContainer: { flexDirection: 'row', gap: 12, marginTop: 10 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  acceptButton: { backgroundColor: '#10B981' },
  declineButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Empty State
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 12, fontSize: 17, color: '#9CA3AF', fontWeight: '500' },
});

export default NewUserValidation;