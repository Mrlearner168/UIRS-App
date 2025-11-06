import { SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';

const UsersData = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [userRole, setUserRole] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('user');
  const [selectedStation, setSelectedStation] = useState(null);
  const [stations, setStations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState(null);
  const [isHead, setIsHead] = useState(false);


  // Load token once on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const storedToken = await EncryptedStorage.getItem('token');
        const storedRole = await EncryptedStorage.getItem('role');
        if (storedToken) {
          setToken(storedToken);
          setUserRole(storedRole);
        } else {
          navigation.navigate('Login');
        }
      } catch (error) {
        console.log('Error fetching token:', error);
      }
    };
    fetchToken();
  }, []);
  console.log(userRole);
  // Fetch users after token is ready
  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/users_data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(res.data);
      //console.log('Fetched users:', res.data);
    } catch (e) {
      console.log('Fetch users error:', e.response?.data || e.message);
    }
  };

  // Fetch stations when needed
  const fetchStations = async () => {
    try {
      const res = await axios.get(`${SERVER_URL}/stations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStations(res.data);
    } catch (e) {
      console.log('Fetch stations error:', e.response?.data || e.message);
      setStations([]);
    }
  };
 // console.log("Stations: ", stations);
  // Refetch users whenever token becomes available
  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  // when selecting user:  
  useEffect(() => {
    if (selectedUser) {
      setIsHead(selectedUser.is_head === true || selectedUser.is_head === 1);
    }
  }, [selectedUser]);

  // Load stations only if "responder" role is picked
  useEffect(() => {
    if (newRole === 'responder_head' || newRole === 'responder_personnel'  && token) {
      fetchStations();
    } else {
      setStations([]);
    }
  }, [newRole, token]);

  // Toggle active/inactive
  const toggleUserStatus = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await axios.put(
        `${SERVER_URL}/toggle_user_status/${id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, status: newStatus } : u,
        ),
      );
      Alert.alert('Success', `User status changed to ${newStatus}.`);
      fetchUsers();
    } catch (e) {
      console.log('Toggle status error:', e.response?.data || e.message);
    }
  };

  // Trash or untrash user
  const toggleTrashUser = async (id, isTrashed) => {
    try {
      const endpoint = isTrashed
        ? `${SERVER_URL}/untrash_user/${id}`
        : `${SERVER_URL}/delete_user/${id}`;
      const method = isTrashed ? 'PUT' : 'DELETE';
      await axios({
        method,
        url: endpoint,
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUsers();
      Alert.alert(
        'Success',
        `User has been ${isTrashed ? 'untrashed' : 'trashed'}.`,
      );
    } catch (e) {
      console.log('Trash/Untrash user error:', e.response?.data || e.message);
    }
  };

  // Update role + station if responder
  const updateUserRole = async (user) => {
    try {
      const payload = { user_id: user.id, role: newRole };
      if ((newRole === 'responder_head' || newRole === 'responder_personnel') && selectedStation) {
        payload.station_id = selectedStation.id;
      }
      
      console.log('Update payload:', payload);
      await axios.put(`${SERVER_URL}/update_user_role`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, role: newRole } : u,
        ),
      );

      setSelectedUser(null);
      setSelectedStation(null);
      Alert.alert('Success', 'User role updated successfully.');
      fetchUsers();
    } catch (e) {
      console.log('Update role error:', e.response?.data || e.message);
    }
  };

  // Permanently delete user
  const deleteUser = async (userId) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to permanently delete this user and all related data?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Call your backend endpoint
              await axios.delete(`${SERVER_URL}/delete_user_full/${userId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });

              fetchUsers(); // refresh users list
              Alert.alert('Success', 'User and all related data deleted.');
            } catch (e) {
              console.log('Delete user error:', e.response?.data || e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Users Management</Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await fetchUsers();
          setRefreshing(false);
        }}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <Text style={styles.userName}>
              {item.firstName} {item.lastName}
            </Text>
            <Text>Role: {item.role}</Text>
              {(item.role === "responder_head" || item.role === "responder_personnel" ) && (
                <Text>Station ID: 
                  {item.station_id} : {item.station_name}
                </Text>
              )}
            <Text
              style={{
                color: item.status === 'active' ? 'green' : 'red',
              }}
            >
              Status: {item.status}
            </Text>
            {item.is_trashed && (
              <Text style={{ color: 'gray' }}>Trashed</Text>
            )}
            {item.role !== 'user' && item.role !== 'responder_head' && (
              <View style={styles.isHeadcontainer}>
                <View style={styles.header}>
                  <Text style={styles.label}>Assign Live Location Sharing? :</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Switch
                      value={item.is_head === true || item.is_head === 1}
                      onValueChange={async (value) => {
                        try {
                          await axios.put(
                            `${SERVER_URL}/toggle_is_head`,
                            { user_id: item.id, is_head: value },
                            { headers: { Authorization: `Bearer ${token}` } }
                          );
                        
                          setUsers((prev) =>
                            prev.map((u) =>
                              u.id === item.id ? { ...u, is_head: value } : u
                            )
                          );
                        } catch (e) {
                          console.log('Toggle head error:', e.response?.data || e.message);
                        }
                      }}
                    />
                    <Text style={{ marginLeft: 10 }}>
                      {item.is_head === true || item.is_head === 1 ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.buttons}>
              <TouchableOpacity
                style={[
                  styles.oblongButton,
                  { backgroundColor: item.is_trashed ? 'green' : 'crimson' },
                ]}
                onPress={() => toggleTrashUser(item.id, item.is_trashed)}
              >
                <Text style={styles.buttonText}>
                  {item.is_trashed ? 'Untrash' : 'Trash'}
                </Text>
              </TouchableOpacity>
              
              {!item.is_trashed && (
                <>
                  <TouchableOpacity
                    style={[
                      styles.oblongButton,
                      {
                        backgroundColor: item.status === 'active' ? 'orange' : 'gray',
                      },
                    ]}
                    onPress={() => toggleUserStatus(item.id, item.status)}
                  >
                    <Text style={styles.buttonText}>
                      {item.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>
                  
                  {userRole === 'admin' && (
                    <TouchableOpacity
                      style={[styles.oblongButton, { backgroundColor: '#0a7' }]}
                      onPress={() => {
                        setSelectedUser(item);
                        setNewRole(item.role);
                      }}
                    >
                      <Text style={styles.buttonText}>Edit Role</Text>
                    </TouchableOpacity>
                  )}
          
                  <TouchableOpacity
                    style={[styles.oblongButton, { backgroundColor: 'red' }]}
                    onPress={() => deleteUser(item.id)}
                  >
                    <Text style={styles.buttonText}>Delete User</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 20 }}>
            <Text>No users found</Text>
          </View>
        }
      />

      {selectedUser && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.closeButtonContainer}>
              <Button
                title="X"
                color="red"
                onPress={() => setSelectedUser(null)}
              />
            </View>

            <Text style={styles.editHeader}>Edit Role</Text>

            <Text style={styles.label}>Select Role:</Text>
            <Picker
              selectedValue={newRole}
              onValueChange={(value) => setNewRole(value)}
              style={styles.picker}
            >
              <Picker.Item label="User" value="user" />
              <Picker.Item label="Responder Head" value="responder_head" />
              <Picker.Item label="Responder Personnel" value="responder_personnel" />
              <Picker.Item label="Admin" value="admin" />
            </Picker>

            {(newRole === 'responder_head' || newRole === 'responder_personnel') && stations.length > 0 && (
              <ScrollView
                style={{ maxHeight: 250, marginBottom: 10 }}
              >
                {stations.map((st) => (
                  <TouchableOpacity
                    key={st.id}
                    style={{
                      padding: 8,
                      backgroundColor:
                        selectedStation?.id === st.id
                          ? '#0a7'
                          : '#eee',
                      marginBottom: 5,
                      borderRadius: 20,
                    }}
                    onPress={() => setSelectedStation(st)}
                  >
                    <Text>
                      ID:{st.id} {st.name} ({st.type})
                    </Text>
                    <Text>{st.address}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.oblongButton1}
              onPress={() => updateUserRole(selectedUser)}
            >
              <Text style={styles.oblongButtonText}>Update Role</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f7f8fc' },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  userCard: {
    backgroundColor: '#fff',
    padding: 15,
    marginVertical: 8,
    borderRadius: 12,
    elevation: 2,
  },
  userName: { fontSize: 18, fontWeight: 'bold' },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 10,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
  },
  closeButtonContainer: { alignItems: 'flex-end', marginBottom: 10 },
  editHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  label: { fontWeight: 'bold', marginBottom: 10, marginLeft: 15 },
  picker: {
    height: 60,
    width: '100%',
    backgroundColor: '#c0dddfff',
    borderRadius: 10,
  },

  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  oblongButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  isHeadcontainer: {
    marginBottom: 10,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 2,
  },
  label: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  oblongButton: {
    paddingHorizontal: 19,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
  },
  oblongButton1: {
    backgroundColor: '#0a7',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 25,
    alignItems: 'center',
    marginVertical: 10,
  },
});

export default UsersData;
