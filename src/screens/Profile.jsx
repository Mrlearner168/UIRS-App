import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from "@react-native-community/netinfo";
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Icon from 'react-native-vector-icons/MaterialIcons';
import UpdateContactModal from '../components/UpdateContactModal';
import { AuthContext } from '../context/AuthContext';

const ProfileScreen = ({ navigation }) => {
  const [userId, setUserId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [avatar, setAvatar] = useState('');
  const [avatarChanged, setAvatarChanged] = useState(false);


  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');

  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('user');
  const [roleStatus, setRoleStatus] = useState('');
  const [roleRequestModalVisible, setRoleRequestModalVisible] = useState(false);

  const [stationId, setStationId] = useState('');
  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfieWithId, setSelfieWithId] = useState(null);
  const [stationSelectionModalVisible, setStationSelectionModalVisible] = useState(false);
  const [stations, setStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpTarget, setOtpTarget] = useState(null); // "email" or "phone"
  const [roleType, setRoleType] = useState("responder_personnel"); 
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateTarget, setUpdateTarget] = useState('email'); // or 'phone'

  const { logout } = useContext(AuthContext);
  
  // Check if the user is online or offline
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);
  
  //check for token
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
        //console.log('Error fetching token:', error);
      }
    };
    fetchToken();
  }, []);
  
  // fetch users data using offline and online methods
  const fetchUserData = async () => {
    try {
      const cached = await EncryptedStorage.getItem("cached_profile");

      if (!token) return;

      if (!isOnline && cached) {
        // Load cached profile when offline
        const user = JSON.parse(cached);
        //console.log("Offline: Loading profile from cache", user);
        setUserId(user.id || '');
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setEmail(user.email || '');
        setPhone(user.phone || '');
        setAge(user.age ? user.age.toString() : '');
        setAvatar(user.avatar ? `${SERVER_URL}/avatar/${user.avatar}` : '');
        setRole(user.role || 'user');
        setRoleStatus(user.role_status || '');
         // Fix: set verified values
        setVerifiedEmail(user.email || '');
        setVerifiedPhone(user.phone || '');
        return;
      }

      // Online fetch
      const response = await axios.get(`${SERVER_URL}/users_profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const user = response.data;
      //console.log("Online: Loaded profile from server", user);
      setUserId(user.id || '');
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setAge(user.age ? user.age.toString() : '');
      setAvatar(user.avatar ? `${SERVER_URL}/avatar/${user.avatar}` : '');
      setRole(user.role || 'user');
      setRoleStatus(user.role_status || '');
       // Fix: set verified values
      setVerifiedEmail(user.email || '');
      setVerifiedPhone(user.phone || '');

      await EncryptedStorage.setItem("cached_profile", JSON.stringify(user));
    } catch (error) {
      console.log("fetchUserData error:", error);
    }
  };

  // Load profile when token changes
  useEffect(() => {
    if (token) fetchUserData();
  }, [token]);

  // Refresh profile when tab is pressed
  useFocusEffect(
    React.useCallback(() => {
      const unsubscribe = navigation.addListener("tabPress", async () => {
        //console.log("Tab pressed: refreshing user data");
        if (token) await fetchUserData();
      });
      return () => unsubscribe();
    }, [navigation, token, isOnline])
  );
  useEffect(() => {
    const fetchStations = async () => {
      if (!token) return;

      setLoadingStations(true);
      try {
        const response = await axios.get(`${SERVER_URL}/stations`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStations(response.data);
      } catch (error) {
        //console.log('Error fetching stations')
      } finally {
        setLoadingStations(false);
      }
    };

    fetchStations();
  }, [token]);

  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }], // Resize to 1024px width, preserve aspect ratio
        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP } // WebP and 70% quality
      );
      return result.uri;
    } catch (err) {
      console.log("Image compression error:", err);
      return uri; // fallback to original
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const compressedUri = await compressImage(result.assets[0].uri);
      setAvatar(compressedUri);
      setAvatarChanged(true);
    }
  };


  const handleSaveAvatar = async () => {
    if (!avatarChanged) return;

    try {
      setLoading(true);
      const formData = new FormData();

      // Include all required fields
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('email', email);
      formData.append('phone', phone);
      if (age) formData.append('age', age);

      // Include avatar
      const uriParts = avatar.split('.');
      const fileType = uriParts[uriParts.length - 1];
      formData.append('avatar', {
        uri: avatar,
        name: `avatar.${fileType}`,
        type: `image/${fileType}`,
      });

      await axios.post(`${SERVER_URL}/update_profile`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
      });

      Alert.alert("Success", "Profile photo updated.");
      setAvatarChanged(false);

    } catch (error) {
      //console.log(error.response?.data || error.message);
      Alert.alert("Error", "Please Select an Image.");
    } finally {
      setLoading(false);
    }
  };

  const pickImageForField = (setter) => {
    Alert.alert(
      "Select Image",
      "Choose an option",
      [
        {
          text: "Camera",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 1,
            });
            if (!result.canceled) {
              const compressedUri = await compressImage(result.assets[0].uri);
              setter(compressedUri);
            }
          },
        },
        {
          text: "Gallery",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 1,
            });
            if (!result.canceled) {
              const compressedUri = await compressImage(result.assets[0].uri);
              setter(compressedUri);
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };
  
  const sendOtp = async () => {
    if (!updateTarget) {
     // console.log("sendOtp called but updateTarget is null");
      return;
    }
  
    try {
      const token = await EncryptedStorage.getItem('token');
      const newContact = updateTarget === 'email' ? email : phone;
    
      if (!newContact) {
        Alert.alert(
          'Error',
          `Enter a valid ${updateTarget}`,
          [{ text: 'OK', onPress: () => fetchUserData() }]
        );
        return;
      }
    
      const response = await fetch(`${SERVER_URL}/send_change_otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          contact: newContact,
          contact_type: updateTarget
        }),
      });
    
      const data = await response.json();
    
      if (response.ok && data.success) {
        Alert.alert('OTP Sent', `OTP sent to your ${updateTarget}`);
        setUpdateModalVisible(true);
      } else {
        Alert.alert(
          'Error',
          data.message || 'Failed to send OTP',
          [{ text: 'OK', onPress: () => fetchUserData() }]
        );
      }
    } catch (err) {
      console.log("sendOtp error:", err);
      Alert.alert(
        'Error',
        'Network error while sending OTP',
        [{ text: 'OK', onPress: () => fetchUserData() }]
      );
    }
  };
  
  const handleSubmitRoleRequest = async () => {
    if (!stationId || !roleType || !idCardFront || !idCardBack || !selfieWithId) {
      Alert.alert("Error", "Please select a station and upload all required images.");
      return;
    }
  
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("stationId", stationId);
      formData.append("roleType", roleType); // NEW FIELD
      formData.append("idCardFront", { uri: idCardFront, name: "idFront.jpg", type: "image/jpeg" });
      formData.append("idCardBack", { uri: idCardBack, name: "idBack.jpg", type: "image/jpeg" });
      formData.append("selfieWithId", { uri: selfieWithId, name: "selfie.jpg", type: "image/jpeg" });
    
      await axios.post(`${SERVER_URL}/submit_role_request`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
    
      Alert.alert("Success", "Role request submitted.");
      await fetchUserData();
      setRoleRequestModalVisible(false);
    
      // reset
      setStationId(null);
      setIdCardFront(null);
      setIdCardBack(null);
      setSelfieWithId(null);
      setRoleType("responder_personnel"); // reset role type
    } catch (error) {
      console.log(error.response?.data || error.message);
      Alert.alert("Error", "Failed to submit role request.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleSavePassword = () => {
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New password and confirm password do not match.");
      return;
    }
    setShowPasswordModal(true); // Show modal to enter current password
  };
  
  const confirmPasswordChange = async () => {
    if (!currentPasswordInput) return;

    try {
      const response = await axios.post(`${SERVER_URL}/update_password`, {
        currentPassword: currentPasswordInput,
        newPassword: newPassword,
        confirmPassword: confirmPassword
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert("Success", response.data.message);
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPasswordInput('');
      setShowPasswordModal(false);
    } catch (error) {
      //console.log(error.response?.data || error.message);
      Alert.alert("Error", error.response?.data?.message || "Update failed.");
    }
  };

  const handleLogout = () => {
    setLogoutModalVisible(false);
    logout();
    Alert.alert("Logged Out", "You have been successfully logged out.");
    navigation.navigate("Login");
  };

  const handleApplyResponderRole = async () => {
    try {
      await fetchUserData();
      if (roleStatus === 'none') {
      setRoleRequestModalVisible(true);
        return;
      }

      if (roleStatus === 'pending') {
        Alert.alert("Info", "Your role request is pending.");
        return;
      }

      if (roleStatus === 'accepted') {
        Alert.alert(
          "Confirm Action",
          "Your role request has already been accepted.Do you want to Request Again?",
          [
            {
              text: "No",
              onPress: () => console.log("User canceled"),
              style: "cancel"
            },
            {
              text: "Yes",
              onPress: () => {
                setRoleRequestModalVisible(true);
              }
            }
          ]
        );
        return;
      }

      if (roleStatus === 'declined' || !status) {
        Alert.alert("Info", "You can't submit a new role request.Invalid Information.");
        return;
      }

      Alert.alert("Info", `Unexpected status: ${roleStatus}. Please contact support.`);
    } catch (error) {
      Alert.alert("Error", "Failed to check role request status.");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserData();
    setRefreshing(false);
    fetchStations();

  };
  console.log(role);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginBottom: 10 }} />}
        
        <View style={styles.profileContainer}>
            <TouchableOpacity
              onPress={() => {
                if (isOnline) {
                  pickImage();
                } else {
                  Alert.alert("Offline", "Cannot change avatar while offline.");
                }
              }}
            >
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>No Image</Text>
                </View>
              )}
            </TouchableOpacity>
            
            {avatarChanged && isOnline && (
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveAvatar}>
                <Text style={styles.saveButtonText}>Save Photo</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.username}>
              {firstName} {lastName}
              <Icon
                name={isOnline ? 'wifi' : 'wifi-off'}
                size={20}
                color={isOnline ? 'green' : 'red'}
                style={{ marginLeft: 1 }}
              />
            </Text>
          </View>
          

        <View style={styles.formContainer}>
          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} editable={false} />

          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} editable={false} />

          <Text style={styles.label}>Age</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" editable={false}/>

          <Text style={styles.label}>Email</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
              }}
            />
            {email !== '' && email !== verifiedEmail && (
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => {
                  setUpdateTarget("email");
                  sendOtp();
                }}
              >
                <Text style={styles.verifyBtnText}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <Text style={styles.label}>Phone</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={phone}
              keyboardType="phone-pad"
              onChangeText={(text) => {
                setPhone(text);
              }}
            />
            {phone !== '' && phone !== verifiedPhone && (
              <TouchableOpacity
                style={styles.verifyBtn}
                onPress={() => {
                  setUpdateTarget("phone");
                  sendOtp();
                }}
              >
                <Text style={styles.verifyBtnText}>Change</Text>
              </TouchableOpacity>

            )}
          </View>
          
          
          {/* PASSWORD SECTION */}
          <Text style={{ fontSize: 14, marginBottom: 8 , textAlign:'center' }}>( Change Password )</Text>
          <Text style={styles.label}>New Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter new password"
              value={newPassword}
              onChangeText={(text) => {
                if (isOnline) {
                  setNewPassword(text);
                } else {
                  Alert.alert("Offline", "Cannot change password while offline.");
                }
              }}
              secureTextEntry={!passwordVisible}
              
            />
            <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
              <Ionicons
                name={passwordVisible ? "eye-off" : "eye"}
                size={22}
                color="gray"
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>
            

          {newPassword && (
            <>
              <Text style={styles.label}>Confirm New Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!passwordVisible}
                />
                <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                  <Ionicons
                    name={passwordVisible ? "eye-off" : "eye"}
                    size={22}
                    color="gray"
                    style={styles.eyeIcon}
                  />
                </TouchableOpacity>
              </View>

              {confirmPassword && (
                <TouchableOpacity style={styles.saveButton} onPress={handleSavePassword}>
                  <Text style={styles.saveButtonText}>Save Password</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ROLE REQUEST */}
          {role !== 'admin' && role !== 'responder_head' && (
            <TouchableOpacity style={styles.saveButton1}  onPress={handleApplyResponderRole}>
              <Text style={styles.saveButtonText}>Apply Responders Role</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={() => setLogoutModalVisible(true)}>
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* MODALS */}
        {/* Password confirm change modal */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text>Enter current password</Text>
              <TextInput
                value={currentPasswordInput}
                onChangeText={setCurrentPasswordInput}
                secureTextEntry
                style={styles.input}
              />
              <View style={{ flexDirection: 'row', marginTop: 15 }}>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.cancelButton}>
                  <Text>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmPasswordChange} style={styles.confirmButton}>
                  <Text>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Logout Modal */}
        <Modal animationType="slide" transparent={true} visible={logoutModalVisible}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalText}>Are you sure you want to log out?</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setLogoutModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={handleLogout}>
                  <Text style={styles.confirmButtonText}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Role Request Modal */}
        <Modal animationType="slide" transparent={true} visible={roleRequestModalVisible}>
          <View style={styles.modalContainer}>
            <View style={styles.roleRequestModalContent}>
              <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Apply Responder Role</Text>

                {/* Station Selection */}
                <TouchableOpacity
                  style={styles.selectStationButton}
                  onPress={() => setStationSelectionModalVisible(true)}
                >
                  <Text style={styles.uploadButtonText}>
                    {stationId
                      ? `Selected: ${stations.find(s => s.id === stationId)?.name}`
                      : "Select Station"}
                  </Text>
                </TouchableOpacity>
                {/* role Type */}
                <Text style={styles.label}>Select Role Type</Text>
                <View style={styles.roleTypeContainer}>
                  {role === "user" && (
                    <TouchableOpacity
                      style={[
                        styles.roleTypeButton,
                        roleType === "responder_personnel" && styles.roleTypeButtonSelected
                      ]}
                      onPress={() => setRoleType("responder_personnel")}
                    >
                      <Text style={styles.roleTypeText}>Responder Personnel</Text>
                    </TouchableOpacity>
                  )}

                  {role === "responder_personnel" && (
                    <TouchableOpacity
                      style={[
                        styles.roleTypeButton,
                        roleType === "responder_head" && styles.roleTypeButtonSelected
                      ]}
                      onPress={() => setRoleType("responder_head")}
                    >
                      <Text style={styles.roleTypeText}>Responder Head</Text>
                    </TouchableOpacity>
                  )}
                </View>
                
                  
                    
                {/* Image Uploads */}
                <Text style={styles.label}>Upload Required Responder ID</Text>
                    
                <TouchableOpacity onPress={() => pickImageForField(setIdCardFront)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {idCardFront ? "ID Card Front Selected" : "Upload ID Card Front"}
                  </Text>
                </TouchableOpacity>
                {idCardFront && <Image source={{ uri: idCardFront }} style={styles.previewImage}/>}
                    
                <TouchableOpacity onPress={() => pickImageForField(setIdCardBack)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {idCardBack ? "ID Card Back Selected" : "Upload ID Card Back"}
                  </Text>
                </TouchableOpacity>
                {idCardBack && <Image source={{ uri: idCardBack }} style={styles.previewImage}/>}
                    
                <TouchableOpacity onPress={() => pickImageForField(setSelfieWithId)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {selfieWithId ? "Selfie with ID Selected" : "Upload Selfie with ID"}
                  </Text>
                </TouchableOpacity>
                {idCardFront && <Image source={{ uri: selfieWithId }} style={styles.previewImage}/>}
                    
                {/* Modal Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setRoleRequestModalVisible(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmButton} onPress={handleSubmitRoleRequest}>
                    <Text style={styles.confirmButtonText}>Submit</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
                    
            {/* Station Selection Modal */}
            <Modal animationType="slide" transparent={true} visible={stationSelectionModalVisible}>
              <View style={styles.stationModalContainer}>
                <View style={styles.stationModalContent}>
                  <Text style={styles.modalTitle}>Select Station</Text>
                  <FlatList
                    data={stations}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.stationItem,
                          item.id === stationId && { backgroundColor: "#d0f0ff" }
                        ]}
                        onPress={() => {
                          setStationId(item.id);
                          setStationSelectionModalVisible(false);
                        }}
                      >
                        <Text style={styles.stationText}>{item.name} ({item.type})</Text>
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#007BFF',
                      padding: 10,
                      borderRadius: 5,
                      alignItems: 'center',
                      marginTop: 10
                    }}
                    onPress={() => setStationSelectionModalVisible(false)}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </View>
        </Modal>
        <UpdateContactModal
          visible={updateModalVisible}
          contactType={updateTarget}  // "email" or "phone"
          userId={userId}              // current logged-in user
          currentContact={updateTarget === "email" ? email : phone}
          onClose={(success, newContact) => {
            setUpdateModalVisible(false);
            if (success) {
              if (updateTarget === "email") setEmail(newContact);
              else setPhone(newContact);
            
              setOtpTarget(updateTarget);
              setOtpVisible(true);
            }
          }}
        />


      </KeyboardAwareScrollView>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    height: 40,
  },
  eyeIcon: {
    marginLeft: 10,
  },
  container: {
    flexGrow: 1,
    backgroundColor: "#f8f9fa",
    padding: 20,
  },
  profileContainer: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 25,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: "#007bff",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#007bff",
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  avatarPlaceholderText: {
    color: '#757575',
    fontSize: 16,
  },
  username: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  formContainer: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#555",
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
  saveButton: {
    backgroundColor: "#00796b",
    padding: 12,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 10,
  },
  verifyBtn: {
  backgroundColor: 'rgb(0, 123, 255)', // Blue
  paddingVertical: 8,
  paddingHorizontal: 50,
  borderRadius: 10,
  marginLeft: 8,
  alignItems: 'center',
  justifyContent: 'center',
  },
  verifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  saveButton1: {
    backgroundColor: "#0288d1",
    padding: 12,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 10,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#ef5350",
    padding: 12,
    borderRadius: 15,
    alignItems: "center",
  },
  logoutButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: 300,
    padding: 20,
    backgroundColor: "white",
    borderRadius: 10,
    alignItems: "center",
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: "#6c757d",
    padding: 12,
    borderRadius: 10,
    flex: 1,
    marginRight: 10,
    alignItems: "center",
  },
  confirmButton: {
    backgroundColor: "#00796b",
    padding: 12,
    borderRadius: 10,
    flex: 1,
    alignItems: "center",
  },
  uploadButton: {
    backgroundColor: '#0288d1',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  roleRequestModalContent: {
    width: '90%',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  previewImage: {
    width: 90,
    height: 80,
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 5,
  },
  scrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  selectStationButton: {
    backgroundColor: '#158ac8ff',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
  },
  stationModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  stationModalContent: {
    width: '90%',
    maxHeight: '70%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
  },
  stationItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderRadius: 8,
  },
  stationText: {
    fontSize: 14,
    color: '#333',
  },
  roleTypeContainer: {
  flexDirection: "row",
  justifyContent: "space-around",
  },
  roleTypeButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#3cea32ff",
    borderRadius: 5
  },
  roleTypeButtonSelected: {
    backgroundColor: "#1c7cdbff"
  },
  roleTypeText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "bold",
  },
});


export default ProfileScreen;

