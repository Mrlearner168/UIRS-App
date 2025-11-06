import { SERVER_URL } from '@env';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import ImageViewing from 'react-native-image-viewing';

const NewUserValidation = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

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
      const pendingUsers = data.filter(user => user.status === 'inactive');
      setUsers(pendingUsers);
      console.log('Fetched new users:', pendingUsers);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch users.');
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
        Alert.alert('Success', 'User validated successfully.');
        fetchNewUsers();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to validate user.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while validating the user.');
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
        Alert.alert('Declined', 'User has been declined.');
        fetchNewUsers();
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to decline user.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while declining the user.');
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
        <Text style={styles.userText}>Name: {item.firstName} {item.lastName}</Text>
        <Text style={styles.userText}>Email: {item.email}</Text>
        <Text style={styles.userText}>Phone: {item.phone}</Text>

        {/* Credentials Section */}
        <View style={styles.credentialsSection}>
          <Text style={styles.credentialsTitle}>Credentials</Text>
          <Text style={styles.userText}>ID Type: {item.id_type}</Text>
          <Text style={styles.userText}>ID Number: {item.id_number}</Text>

          <View style={styles.mediaContainer}>
            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>ID Front:</Text>
              {item.id_front_path ? (
                <TouchableOpacity onPress={() => openImageViewer(images, 0)}>
                  <Image source={{ uri: item.id_front_path }} style={styles.image} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>No Image</Text>
              )}
            </View>

            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>ID Back:</Text>
              {item.id_back_path ? (
                <TouchableOpacity onPress={() => openImageViewer(images, 1)}>
                  <Image source={{ uri: item.id_back_path }} style={styles.image} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>No Image</Text>
              )}
            </View>

            <View style={styles.credentialItem}>
              <Text style={styles.credentialLabel}>Selfie with ID:</Text>
              {item.selfie_path ? (
                <TouchableOpacity onPress={() => openImageViewer(images, 2)}>
                  <Image source={{ uri: item.selfie_path }} style={styles.image} />
                </TouchableOpacity>
              ) : (
                <Text style={styles.imagePlaceholder}>No Image</Text>
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
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#dc3545' }]}
            onPress={() => declineUser(item.id)}
          >
            <Text style={styles.buttonText}>Decline</Text>
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
      <Text style={styles.title}>Pending User Verifications</Text>
      {loading ? (
        <Text>Loading...</Text>
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
              <Text>No new users found</Text>
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
