import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from "@react-native-community/netinfo";
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getAppLanguage, setAppLanguage } from '../translation/i18nStorage';

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
  const [language, setLanguage] = useState('en');

  const { t, i18n } = useTranslation();
  const { logout } = useContext(AuthContext);
  console.log(avatar);

  // Check if the user is online or offline
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(state.isConnected));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncLanguage = async () => {
      const savedLang = await getAppLanguage();
      setLanguage(savedLang);
    };
    syncLanguage();
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
        if (token) await fetchUserData();
        setNewPassword('');
        setConfirmPassword('');
        setCurrentPasswordInput('');
      });
      return () => unsubscribe();
    }, [navigation, token])
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

      Alert.alert("Success", t('avatarupdated'));
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
      t('chooseimagesource'),
      t('uploadimage'),
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
        { text: t('cancel'), style: "cancel" },
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
      Alert.alert("Error", t('uploadrequired'));
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("stationId", stationId);
      formData.append("roleType", roleType); // NEW FIELD
      const compressedFront = await compressImage(idCardFront);
      const compressedBack = await compressImage(idCardBack);
      const compressedSelfie = await compressImage(selfieWithId);
      formData.append("idCardFront", { uri: compressedFront, name: "idFront.webp", type: "image/webp" });
      formData.append("idCardBack", { uri: compressedBack, name: "idBack.webp", type: "image/webp" });
      formData.append("selfieWithId", { uri: compressedSelfie, name: "selfie.webp", type: "image/webp" });

      await axios.post(`${SERVER_URL}/submit_role_request`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });

      Alert.alert("Success", t('rolesubmitted'));
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
      Alert.alert("Error", t('notmatch'));
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
    Alert.alert("Logged Out", t('logoutsuccess'));
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
        Alert.alert("Info", t('rolerequestpending'));
        return;
      }

      if (roleStatus === 'accepted') {
        Alert.alert(
          "Confirm Action",
          t('confirmrolechange'),
          [
            {
              text: t('no'),
              onPress: () => console.log("User canceled"),
              style: "cancel"
            },
            {
              text: t('yes'),
              onPress: () => {
                setRoleRequestModalVisible(true);
              }
            }
          ]
        );
        return;
      }

      if (roleStatus === 'declined' || !status) {
        Alert.alert("Info", t('declinedrole'));
        return;
      }

      Alert.alert("Info", `Unexpected status: ${roleStatus}. Please contact support.`);
    } catch (error) {
      Alert.alert("Error", t('erroroccurred'));
    }
  };
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserData();
    await fetchStations(); // ensure you await this if it's async
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPasswordInput(''); // add this
  };
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && <ActivityIndicator size="large" color="#007bff" style={{ marginBottom: 10 }} />}
        <View style={styles.languageContainer}>
          <View style={styles.languageRow}>
            <Ionicons name="globe-outline" size={20} color="black" style={{ marginRight: 5 }} />
            <Picker
              selectedValue={language}
              onValueChange={async (value) => {
                setLanguage(value);
                await setAppLanguage(value);
              }}
              style={styles.languagePicker}
              mode="dropdown"
            >
              <Picker.Item label="English" value="en" />
              <Picker.Item label="Filipino" value="fil" />
              <Picker.Item label="Hiligaynon" value="hil" />
            </Picker>

          </View>
        </View>
        <View style={styles.profileContainer}>
          <TouchableOpacity
            onPress={() => {
              if (isOnline) {
                pickImage();
              } else {
                Alert.alert("Offline", t('cantchangeoffline'));
              }
            }}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>{t('noimage')}</Text>
              </View>
            )}
          </TouchableOpacity>

          {avatarChanged && isOnline && (
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveAvatar}>
              <Text style={styles.saveButtonText}>{t('savephoto')}</Text>
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
          <Text style={styles.label}>{t('firstname')}</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} editable={false} />

          <Text style={styles.label}>{t('lastname')}</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} editable={false} />

          <Text style={styles.label}>{t('age')}</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" editable={false} />

          <Text style={styles.label}>{t('email')}</Text>
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
                  if (isOnline) {
                    setUpdateTarget("email");
                    sendOtp();
                  } else {
                    Alert.alert("Offline", t('cantchangeoffline'));
                  }
                }}
              >
                <Text style={styles.verifyBtnText}>{t('savechanges')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.label}>{t('phone')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={phone}
              keyboardType="phone-pad"
              onChangeText={(text) => {
                if (isOnline) {
                  setPhone(text);
                } else {
                  Alert.alert(t('offline'), t('cantchangeoffline '));
                }
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
                <Text style={styles.verifyBtnText}>{t('savechanges')}</Text>
              </TouchableOpacity>

            )}
          </View>

          {/* PASSWORD SECTION */}
          <Text style={{ fontSize: 14, marginBottom: 8, textAlign: 'center', color: '#000' }}>
            ( {t('changepassword')} )
          </Text>

          <Text style={[styles.label, { color: '#000' }]}>{t('newpassword')}</Text>
          <View style={[styles.passwordContainer, { backgroundColor: '#fff' }]}>
            <TextInput
              style={[styles.passwordInput, { color: '#000' }]}
              placeholder={t('enternewpassword')}
              placeholderTextColor="#888"
              value={newPassword}
              onChangeText={(text) => {
                if (isOnline) {
                  setNewPassword(text);
                } else {
                  Alert.alert(t('offline'), t('erroroffline'));
                }
              }}
              secureTextEntry={!passwordVisible}
            />

            <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
              <Ionicons
                name={passwordVisible ? "eye-off" : "eye"}
                size={22}
                color="#000"
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>

          {newPassword && (
            <>
              <Text style={[styles.label, { color: '#000' }]}>{t('confirmpassword')}</Text>
              <View style={[styles.passwordContainer, { backgroundColor: '#fff' }]}>
                <TextInput
                  style={[styles.passwordInput, { color: '#000' }]}
                  placeholder={t('confirmpassword')}
                  placeholderTextColor="#888"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    if (isOnline) {
                      setConfirmPassword(text);
                    } else {
                      Alert.alert(t('offline'), t('erroroffline'));
                    }
                  }}
                  secureTextEntry={!passwordVisible}
                />

                <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                  <Ionicons
                    name={passwordVisible ? "eye-off" : "eye"}
                    size={22}
                    color="#000"
                    style={styles.eyeIcon}
                  />
                </TouchableOpacity>
              </View>

              {confirmPassword && (
                <TouchableOpacity style={styles.saveButton} onPress={handleSavePassword}>
                  <Text style={styles.saveButtonText}>{t('savepassword')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ROLE REQUEST */}
          {role !== 'admin' && role !== 'responder_head' && (
            <TouchableOpacity style={styles.saveButton1} onPress={handleApplyResponderRole}>
              <Text style={styles.saveButtonText}>{t('applyresponder')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutButton} onPress={() => setLogoutModalVisible(true)}>
            <Text style={styles.logoutButtonText}>{t('logout')}</Text>
          </TouchableOpacity>
        </View>

        {/* MODALS */}
        {/* Password confirm change modal */}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text>{t('currentpass')}</Text>
              <TextInput
                value={currentPasswordInput}
                onChangeText={setCurrentPasswordInput}
                secureTextEntry
                style={styles.input}
              />
              <View style={{ flexDirection: 'row', marginTop: 15 }}>
                <TouchableOpacity onPress={() => setShowPasswordModal(false)} style={styles.cancelButton}>
                  <Text>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmPasswordChange} style={styles.confirmButton}>
                  <Text>{t('confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Logout Modal */}
        <Modal animationType="slide" transparent={true} visible={logoutModalVisible}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalText}>{t('logoutinfo')}</Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setLogoutModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={handleLogout}>
                  <Text style={styles.confirmButtonText}>{t('logout')}</Text>
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
                <Text style={styles.modalTitle}>{t('applyresponder')}</Text>

                {/* Station Selection */}
                <TouchableOpacity
                  style={styles.selectStationButton}
                  onPress={() => setStationSelectionModalVisible(true)}
                >
                  <Text style={styles.uploadButtonText}>
                    {stationId
                      ? `Selected: ${stations.find(s => s.id === stationId)?.name}`
                      : t('selectstation')}
                  </Text>
                </TouchableOpacity>
                {/* role Type */}
                <Text style={styles.label}>{t('selectroletype')}</Text>
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
                <Text style={styles.label}>{t('requiredID')}</Text>

                <TouchableOpacity onPress={() => pickImageForField(setIdCardFront)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {idCardFront ? t('selectedfrontid') : t('uploadfrontid')}
                  </Text>
                </TouchableOpacity>
                {idCardFront && <Image source={{ uri: idCardFront }} style={styles.previewImage} />}

                <TouchableOpacity onPress={() => pickImageForField(setIdCardBack)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {idCardBack ? t('selectedbackid') : t('uploadbackid')}
                  </Text>
                </TouchableOpacity>
                {idCardBack && <Image source={{ uri: idCardBack }} style={styles.previewImage} />}

                <TouchableOpacity onPress={() => pickImageForField(setSelfieWithId)} style={styles.uploadButton}>
                  <Text style={styles.uploadButtonText}>
                    {selfieWithId ? t('selectedselfieid') : t('uploadselfieid')}
                  </Text>
                </TouchableOpacity>
                {idCardFront && <Image source={{ uri: selfieWithId }} style={styles.previewImage} />}

                {/* Modal Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setRoleRequestModalVisible(false)}>
                    <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmButton} onPress={handleSubmitRoleRequest}>
                    <Text style={styles.confirmButtonText}>{t('submit')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>

            {/* Station Selection Modal */}
            <Modal animationType="slide" transparent={true} visible={stationSelectionModalVisible}>
              <View style={styles.stationModalContainer}>
                <View style={styles.stationModalContent}>
                  <Text style={styles.modalTitle}>{t('selectstation')}</Text>
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
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('cancel')}</Text>
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
    backgroundColor: "#fff",
    color: "#000",
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
    color: "#000",
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
  languageContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    width: 50,
    zIndex: 20,
    borderRadius: 25,
    padding: 1,
  },
  languagePicker: {
    color: 'black',
    width: '100%',
    height: 40,
    marginRight: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 25,

  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
    color: 'black',
    borderRadius: 25,
    paddingHorizontal: 8,
  },
});

export default ProfileScreen;

