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
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [imageLoadingState, setImageLoadingState] = useState({});
  const {t} = useTranslation();
  const pendingRequestsRef = useRef({}); // Prevent duplicate requests

  // Image loading and error handling
  const handleImageLoad = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: false, loaded: true }
    }));
    delete pendingRequestsRef.current[uri]; // Remove from pending
  }, []); // Empty dependency array

  const handleImageError = useCallback((uri) => {
    setImageLoadingState(prev => ({
      ...prev,
      [uri]: { loading: false, error: true, loaded: false }
    }));
    delete pendingRequestsRef.current[uri]; // Remove from pending
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
          console.log("Admin token fetched:", storedToken);
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
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/users_data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      console.log(token);
      console.log('All users data:', JSON.stringify(data, null, 2));
      const pendingUsers = data.filter(user => user.status === 'inactive');
      setUsers(pendingUsers);
      console.log('Fetched new users:', pendingUsers);
    } catch (error) {
      Alert.alert('Error', t('failedtofetch'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNewUsers();
    setRefreshing(false);
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
    setViewerImages(images);
    setViewerIndex(index);
    setImageViewerVisible(true);
  };

  const renderUser = ({ item }) => {
    const images = [
      { uri: item.id_front_path },
      { uri: item.id_back_path },
      { uri: item.selfie_path },
    ].filter(img => img.uri);

    return (
      <View style={styles.userCard}>
        <Text style={styles.userText}>{t('firstname')}: {item.firstName} {item.lastName}</Text>
        <Text style={styles.userText}>{t('Email')}: {item.email}</Text>
        <Text style={styles.userText}>{t('phone')}: {item.phone}</Text>

        {/* Credentials Section */}
        <View style={styles.credentialsSection}>
          <Text style={styles.credentialsTitle}>Credentials</Text>
          <Text style={styles.userText}>{t('idtype')}:{item.id_type}</Text>
          <Text style={styles.userText}>{t('idnumber')}:{item.id_number}</Text>

          <View style={styles.mediaContainer}>
            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>{t('idcardfront')}</Text>
              {item.id_front_path ? (
                <TouchableOpacity 
                  style={styles.imageWrapper}
                  onPress={() => openImageViewer(images, 0)}>
                  {(() => {
                    const imageState = imageLoadingState[item.id_front_path] || { loading: true, error: false };
                    return (
                      <>
                        {imageState.loading && (
                          <View style={styles.imageLoadingContainer}>
                            <ActivityIndicator size="large" color="#007BFF" />
                          </View>
                        )}
                        {imageState.error ? (
                          <View style={[styles.image, styles.imageError]}>
                            <Icon name="broken-image" size={40} color="#999" />
                          </View>
                        ) : (
                          <ExpoImage 
                            source={{ uri: item.id_front_path }}
                            style={styles.image}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            onLoad={() => handleImageLoad(item.id_front_path)}
                            onError={() => handleImageError(item.id_front_path)}
                            onLoadStart={() => setImageLoading(item.id_front_path, true)}
                          />
                        )}
                      </>
                    );
                  })()}
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>{t('noimage')}</Text>
              )}
            </View>

            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>{t('idcardback')}</Text>
              {item.id_back_path ? (
                <TouchableOpacity 
                  style={styles.imageWrapper}
                  onPress={() => openImageViewer(images, 1)}>
                  {(() => {
                    const imageState = imageLoadingState[item.id_back_path] || { loading: true, error: false };
                    return (
                      <>
                        {imageState.loading && (
                          <View style={styles.imageLoadingContainer}>
                            <ActivityIndicator size="large" color="#007BFF" />
                          </View>
                        )}
                        {imageState.error ? (
                          <View style={[styles.image, styles.imageError]}>
                            <Icon name="broken-image" size={40} color="#999" />
                          </View>
                        ) : (
                          <ExpoImage 
                            source={{ uri: item.id_back_path }}
                            style={styles.image}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            onLoad={() => handleImageLoad(item.id_back_path)}
                            onError={() => handleImageError(item.id_back_path)}
                            onLoadStart={() => setImageLoading(item.id_back_path, true)}
                          />
                        )}
                      </>
                    );
                  })()}
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>{t('noimage')}</Text>
              )}
            </View>

            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>{t('selfiewithid')}</Text>
              {item.selfie_path ? (
                <TouchableOpacity 
                  style={styles.imageWrapper}
                  onPress={() => openImageViewer(images, 2)}>
                  {(() => {
                    const imageState = imageLoadingState[item.selfie_path] || { loading: true, error: false };
                    return (
                      <>
                        {imageState.loading && (
                          <View style={styles.imageLoadingContainer}>
                            <ActivityIndicator size="large" color="#007BFF" />
                          </View>
                        )}
                        {imageState.error ? (
                          <View style={[styles.image, styles.imageError]}>
                            <Icon name="broken-image" size={40} color="#999" />
                          </View>
                        ) : (
                          <ExpoImage 
                            source={{ uri: item.selfie_path }}
                            style={styles.image}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            onLoad={() => handleImageLoad(item.selfie_path)}
                            onError={() => handleImageError(item.selfie_path)}
                            onLoadStart={() => setImageLoading(item.selfie_path, true)}
                          />
                        )}
                      </>
                    );
                  })()}
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>{t('noimage')}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Action Buttons Below User Info */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#28a745' }]}
            onPress={() => validateUser(item.id)}
          >
            <Text style={styles.buttonText}>{t('acceptrequest')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#dc3545' }]}
            onPress={() => declineUser(item.id)}
          >
            <Text style={styles.buttonText}>{t('declinerequest')}</Text>
          </TouchableOpacity>
        </View>

        {/* Image Viewer */}
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('pendinguserver')}</Text>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#007BFF" />
          <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>{t('loading') || 'Loading...'}</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderUser}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text>{t('nousersfound')}</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#f8f8f8' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  userCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, elevation: 3 },
  userText: { fontSize: 16, marginBottom: 5 },
  image: { width: 100, height: 100, borderRadius: 12 },
  imagePlaceholder: {
    width: 100, height: 100, borderRadius: 8, backgroundColor: '#e0e0e0',
    textAlign: 'center', textAlignVertical: 'center', color: '#888'
  },
  imageWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0'
  },
  imageLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10
  },
  imageError: {
    backgroundColor: '#ffe8e8',
    justifyContent: 'center',
    alignItems: 'center'
  },
  mediaContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginVertical: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  credentialsSection: { marginTop: 10, marginBottom: 10, backgroundColor: '#f0f4ff', borderRadius: 6, padding: 10 },
  credentialsTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 5, color: '#007bff' },
  credentialItem: { marginBottom: 10, alignItems: 'center' },
  credentialLabel: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    padding: 10,
    borderRadius: 16,
    alignItems: 'center',
    marginHorizontal: 5,
  },
});

export default NewUserValidation;
