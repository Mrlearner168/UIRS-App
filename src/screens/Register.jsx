import { SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// CHANGED: Use Expo vector icons for compatibility
import { Ionicons } from '@expo/vector-icons';

const RegisterScreen = ({ navigation }) => {
  const { t } = useTranslation();

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [idType, setIdType] = useState('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [age, setAge] = useState('');

  // Image State
  const [frontIdImage, setFrontIdImage] = useState(null);
  const [backIdImage, setBackIdImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);

  // UI/Logic State
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingContact, setCheckingContact] = useState(false);

  // OTP State
  const [otpVisible, setOtpVisible] = useState(false);
  const [timer, setTimer] = useState(300);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Permissions Hooks
  const [cameraStatus, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [galleryStatus, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();

  // --- PASSWORD STRENGTH LOGIC ---
  const getPasswordAnalysis = (pass) => {
    return {
      length: pass.length >= 8,
      upper: /[A-Z]/.test(pass),
      lower: /[a-z]/.test(pass),
      number: /\d/.test(pass),
      special: /[@$!%*?&]/.test(pass),
    };
  };

  const passwordAnalysis = getPasswordAnalysis(password);
  const passwordScore = Object.values(passwordAnalysis).filter(Boolean).length;

  const getStrengthColor = () => {
    if (passwordScore <= 2) return '#ff4444'; // Red
    if (passwordScore <= 4) return '#ffbb33'; // Orange
    return '#00C851'; // Green
  };

  const getStrengthLabel = () => {
    if (passwordScore <= 2) return 'Weak';
    if (passwordScore <= 4) return 'Medium';
    return 'Strong';
  };

  // --- TIMER LOGIC (Fixed Memory Leak) ---
  useEffect(() => {
    let interval = null;
    if (otpVisible && timer > 0) {
      interval = setInterval(() => {
        setTimer((prevTimer) => prevTimer - 1);
      }, 1000);
    } else if (!otpVisible) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [otpVisible, timer]);

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // --- IMAGE HANDLING ---
  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP }
      );
      return { uri: result.uri, type: 'image/webp', ext: 'webp' };
    } catch (err) {
      console.log("Image compression error:", err);
      // Fallback to original if compression fails
      return { uri: uri, type: 'image/jpeg', ext: 'jpg' };
    }
  };

  const handleImagePick = async (setImageField, source) => {
    // 1. Check Permissions
    if (source === 'camera') {
      if (!cameraStatus?.granted) {
        const permission = await requestCameraPermission();
        if (!permission.granted) {
          Alert.alert("Permission Required", "Camera access is needed to take photos.");
          return;
        }
      }
    } else {
      if (!galleryStatus?.granted) {
        const permission = await requestGalleryPermission();
        if (!permission.granted) {
          Alert.alert("Permission Required", "Gallery access is needed to select photos.");
          return;
        }
      }
    }

    // 2. Launch Picker
    let result;
    try {
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images, // Correct Enum
          allowsEditing: true,
          aspect: [4, 3],
          quality: 1,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 1,
        });
      }

      // 3. Process Result
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const originalUri = result.assets[0].uri;
        const compressed = await compressImage(originalUri);
        const timestamp = new Date().getTime();
        
        setImageField({
          uri: compressed.uri,
          type: compressed.type,
          fileName: `${source}_image_${timestamp}.${compressed.ext}`,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const pickImageForField = (setImageField) => {
    Alert.alert(
      t("uploadimage"),
      t("chooseimagesource"),
      [
        { text: "Camera", onPress: () => handleImagePick(setImageField, 'camera') },
        { text: "Gallery", onPress: () => handleImagePick(setImageField, 'gallery') },
        { text: t('cancel'), style: "cancel" },
      ]
    );
  };

  // --- VALIDATION ---
  const validateInputs = () => {
    const newErrors = {};

    if (!firstName.trim()) newErrors.firstName = t('firstnamerequired');
    if (!lastName.trim()) newErrors.lastName = t('lastnamerequired');
    
    // Strict phone validation
    if (!phoneNumber.trim()) newErrors.phoneNumber = t('phonenumberrequired');
    else if (!/^9\d{9}$/.test(phoneNumber)) newErrors.phoneNumber = t('invalidphonenumber');
    
    if (!email.trim()) newErrors.email = t('emailrequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = t('invalidemail');
    
    if (!age.trim() || isNaN(age) || parseInt(age) <= 0) newErrors.age = t('agerequired');
    
    if (!idNumber.trim()) newErrors.idNumber = t('idnumberrequired');
    else {
      let pattern;
      switch (idType) {
        case 'National ID':
        case 'Voter\'s ID': pattern = /^\d{15}$/; break;
        case 'Passport': pattern = /^[A-Z]\d{7}[A-Z]$/i; break;
        // Updated Pattern: 3 Alphanum, Dash, 2 Numeric, optional Dash, 6-7 Alphanum
        case "Driver's License": pattern = /^[A-Z0-9]{3}-\d{2}-?[A-Z0-9]{6,7}$/i; break;
        // Updated Pattern: Hyphenated OR Numeric up to 12 digits
        case 'Student\'s ID': pattern = /^([A-Z0-9]+(-[A-Z0-9]+){1,3}|\d{1,12})$/i; break;
        default: pattern = /.+/;
      }
      if (!pattern.test(idNumber)) newErrors.idNumber = `Invalid ${idType} format`;
    }

    if (!frontIdImage) newErrors.frontIdImage = t('uploadfrontid');
    if (!backIdImage) newErrors.backIdImage = t('uploadbackid');
    if (!selfieImage) newErrors.selfieImage = t('uploadselfieid');

    if (!password.trim()) newErrors.password = t('passwordrequired');
    else if (password.length < 8) newErrors.password = t('passwordlength');
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password))
      newErrors.password = t('passwordcomplexity');

    if (password !== confirmPassword) newErrors.confirmPassword = t('notmatch');

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- API CALLS ---
  const checkContactExists = async (contact) => {
    try {
      const response = await fetch(`${SERVER_URL}/check_contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });

      if (!response.ok) throw new Error("Server error");
      
      const data = await response.json();
      return data.exists;
    } catch (err) {
      // Changed: Don't return true on network error, propagate error
      throw new Error("Connectivity issue");
    }
  };

  const sendEmailOtp = async () => {
    if (!email) return;

    // Check email existence first
    try {
      const emailExists = await checkContactExists(email);
      if (emailExists) {
        Alert.alert('Error', t('emailalreadyregistered'));
        return;
      }
    } catch (error) {
       Alert.alert('Connection Error', t('checkcontactfailed'));
       return;
    }

    setOtpLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/send_register_otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setOtpSent(true);
        setOtpVisible(true);
        setTimer(300); // Reset timer to 5 minutes
        Alert.alert('OTP Sent', t('otpsent'));
      } else {
        Alert.alert('Error', data.message || t('otpfailed'));
      }
    } catch (err) {
      Alert.alert('Error', t('otpfailed'));
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!email || !otpCode) {
      Alert.alert('Error', t('enterotp'));
      return;
    }

    setVerifyLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: email, otp: otpCode }),
      });
      
      const data = await response.json();

      if (response.ok && data.success) {
        setOtpVerified(true);
        setOtpVisible(false); // Close Modal
        setOtpSent(false);
        setOtpCode('');
        Alert.alert('Verified', t('otpsuccess'));
        // Automatically proceed to registration after verification
        setTimeout(() => handleAddUser(), 500); 
      } else if (data.message === 'OTP expired') {
        Alert.alert('OTP Expired', t('expiredotp'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('resend'), onPress: sendEmailOtp },
        ]);
      } else {
        Alert.alert('Invalid OTP', t('invalidotp'));
      }
    } catch (error) {
      Alert.alert('Error', t('verifyotpfailed'));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!validateInputs()) return;

    setCheckingContact(true);
    try {
      const [emailExists, phoneExists] = await Promise.all([
        checkContactExists(email),
        checkContactExists(phoneNumber),
      ]);

      if (emailExists || phoneExists) {
        const newErrors = {};
        if (emailExists) {
          newErrors.email = t('emailregistered');
          Alert.alert('Duplicate Email', t('emailalreadyregistered'));
        }
        if (phoneExists) {
          newErrors.phoneNumber = t('phoneregistered');
          Alert.alert('Duplicate Phone', t('phonealreadyregistered'));
        }
        setErrors((prev) => ({ ...prev, ...newErrors }));
        return;
      }

      // Logic: If OTP not verified yet, start OTP flow
      if (!otpVerified) {
        sendEmailOtp(); // This handles opening the modal on success
        return;
      }

      // If OTP verified, proceed
      handleAddUser();

    } catch (error) {
      Alert.alert('Error', t('checkcontactfailed'));
    } finally {
      setCheckingContact(false);
    }
  };

  const handleAddUser = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('firstName', firstName);
      formData.append('lastName', lastName);
      formData.append('phoneNumber', `+63${phoneNumber}`);
      formData.append('email', email);
      formData.append('password', password);
      formData.append('age', age);
      formData.append('idType', idType);
      formData.append('idNumber', idNumber);

      // Robust image appending
      if (frontIdImage) formData.append('frontIdImage', { uri: frontIdImage.uri, name: frontIdImage.fileName, type: frontIdImage.type });
      if (backIdImage) formData.append('backIdImage', { uri: backIdImage.uri, name: backIdImage.fileName, type: backIdImage.type });
      if (selfieImage) formData.append('selfieImage', { uri: selfieImage.uri, name: selfieImage.fileName, type: selfieImage.type });

      const response = await fetch(`${SERVER_URL}/add_user`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });

      // Guard against non-JSON responses (500 errors often return HTML)
      const text = await response.text(); 
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("Server returned invalid response");
      }

      if (response.ok) {
        Alert.alert('Success', t('registrationsuccess'));
        navigation.navigate("Login");
      } else {
        Alert.alert('Registration Failed', data.message || t('registrationfailed'));
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', t('registrationfailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.container}
    >
      <View style={styles.formContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{t('register')}</Text>

          {/* First Name */}
          <TextInput
            style={[styles.input, errors.firstName && styles.inputError]}
            placeholder={t('firstname')}
            placeholderTextColor="#666"
            value={firstName}
            onChangeText={(text) => {
              setFirstName(text);
              if (errors.firstName) setErrors({ ...errors, firstName: '' });
            }}
          />
          {errors.firstName && <Text style={styles.error}>{errors.firstName}</Text>}
          
          {/* Last Name */}
          <TextInput
            style={[styles.input, errors.lastName && styles.inputError]}
            placeholder={t('lastname')}
            placeholderTextColor="#666"
            value={lastName}
            onChangeText={(text) => {
              setLastName(text);
              if (errors.lastName) setErrors({ ...errors, lastName: '' });
            }}
          />
          {errors.lastName && <Text style={styles.error}>{errors.lastName}</Text>}
          
          {/* Phone */}
          <View style={[styles.phoneContainer, errors.phoneNumber && styles.inputError]}>
            <Text style={styles.phonePrefix}>+63</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="9XXXXXXXXX"
              placeholderTextColor="#666"
              value={phoneNumber}
              maxLength={10}
              onChangeText={(text) => {
                let cleaned = text.replace(/[^0-9]/g, '');
                if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                setPhoneNumber(cleaned);
                if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: '' });
              }}
              keyboardType="number-pad"
            />
          </View>
          {errors.phoneNumber && <Text style={styles.error}>{errors.phoneNumber}</Text>}
            
          {/* Email */}
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder={t('email')}
            placeholderTextColor="#666"
            value={email}
            autoCapitalize="none"
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            keyboardType="email-address"
          />
          {errors.email && <Text style={styles.error}>{errors.email}</Text>}
          
          {/* Age */}
          <TextInput
            style={[styles.input, errors.age && styles.inputError]}
            placeholder={t('age')}
            placeholderTextColor="#666"
            value={age}
            maxLength={3}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              setAge(cleaned);
              if (errors.age) setErrors({ ...errors, age: '' });
            }}
            keyboardType="numeric"
          />
          {errors.age && <Text style={styles.error}>{errors.age}</Text>}
          
          {/* ID Type Picker */}
          <View style={[styles.pickerContainer, { backgroundColor: '#fff' }]}>
            <Picker
              selectedValue={idType}
              onValueChange={(val) => setIdType(val)}
              style={{ color: '#000' }}
              dropdownIconColor="#000"
            >
              <Picker.Item label="National ID" value="National ID" />
              <Picker.Item label="Passport" value="Passport" />
              <Picker.Item label="Driver's License" value="Driver's License" />
              <Picker.Item label="Voter's ID" value="Voter's ID" />
              <Picker.Item label="Student's ID" value="Student's ID" />
            </Picker>
          </View>
                  
          {/* ID Number */}
          <TextInput
            style={[styles.input, errors.idNumber && styles.inputError]}
            placeholder={
              idType === 'National ID' || idType === "Voter's ID" ? '15-digit number' :
              idType === 'Passport' ? '6-9 characters' :
              // UPDATED PLACEHOLDER for new Regex
              idType === "Driver's License" ? 'e.g., ABC-12-XYZ123' :
              '4-15 characters'
            }
            placeholderTextColor="#666"
            value={idNumber}
            onChangeText={(text) => {
                setIdNumber(text);
                if (errors.idNumber) setErrors({...errors, idNumber: ''});
            }}
          />
          {errors.idNumber && <Text style={styles.error}>{errors.idNumber}</Text>}

          {/* Image Uploads */}
          <TouchableOpacity onPress={() => pickImageForField(setFrontIdImage)} style={styles.imageUploadButton}>
            <Text style={styles.imageButtonText}>{frontIdImage ? t('selectedfrontid') : t('uploadfrontid')}</Text>
          </TouchableOpacity>
          {errors.frontIdImage && <Text style={styles.error}>{errors.frontIdImage}</Text>}
          {frontIdImage && <Image source={{ uri: frontIdImage.uri }} style={styles.previewImage} resizeMode="contain" />}

          <TouchableOpacity onPress={() => pickImageForField(setBackIdImage)} style={styles.imageUploadButton}>
            <Text style={styles.imageButtonText}>{backIdImage ? t('selectedbackid') : t('uploadbackid')}</Text>
          </TouchableOpacity>
          {errors.backIdImage && <Text style={styles.error}>{errors.backIdImage}</Text>}
          {backIdImage && <Image source={{ uri: backIdImage.uri }} style={styles.previewImage} resizeMode="contain" />}

          <TouchableOpacity onPress={() => pickImageForField(setSelfieImage)} style={styles.imageUploadButton}>
            <Text style={styles.imageButtonText}>{selfieImage ? t('selectedselfieid') : t('uploadselfieid')}</Text>
          </TouchableOpacity>
          {errors.selfieImage && <Text style={styles.error}>{errors.selfieImage}</Text>}
          {selfieImage && <Image source={{ uri: selfieImage.uri }} style={styles.previewImage} resizeMode="contain" />}

          {/* Passwords */}
          <View style={[styles.passwordContainer, errors.password && styles.inputError]}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('password')}
              placeholderTextColor="#666"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password) setErrors({...errors, password: ''});
              }}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.toggleButtonInside}>
              <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="gray" />
            </TouchableOpacity>
          </View>
          
          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <View style={styles.passwordStrengthContainer}>
                <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}>
                    <View style={[styles.strengthBarBackground]}>
                        <View style={[styles.strengthBarFill, { backgroundColor: getStrengthColor(), width: `${(passwordScore / 5) * 100}%` }]} />
                    </View>
                    <Text style={[styles.strengthText, { color: getStrengthColor() }]}>{getStrengthLabel()}</Text>
                </View>
                <View style={styles.criteriaContainer}>
                    <Text style={[styles.criteriaText, passwordAnalysis.length ? styles.metCriteria : styles.unmetCriteria]}>• At least 8 characters</Text>
                    <Text style={[styles.criteriaText, passwordAnalysis.upper ? styles.metCriteria : styles.unmetCriteria]}>• Uppercase letter</Text>
                    <Text style={[styles.criteriaText, passwordAnalysis.lower ? styles.metCriteria : styles.unmetCriteria]}>• Lowercase letter</Text>
                    <Text style={[styles.criteriaText, passwordAnalysis.number ? styles.metCriteria : styles.unmetCriteria]}>• Number</Text>
                    <Text style={[styles.criteriaText, passwordAnalysis.special ? styles.metCriteria : styles.unmetCriteria]}>• Special character (@$!%*?&)</Text>
                </View>
            </View>
          )}

          {errors.password && <Text style={styles.error}>{errors.password}</Text>}

          <View style={[styles.passwordContainer, errors.confirmPassword && styles.inputError]}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('confirmpassword')}
              placeholderTextColor="#666"
              value={confirmPassword}
              onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) setErrors({...errors, confirmPassword: ''});
              }}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.toggleButtonInside}>
              <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={22} color="gray" />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.button, (checkingContact || otpLoading || loading) && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={checkingContact || otpLoading || loading}
          >
            {checkingContact || otpLoading || loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('register')}</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.loginButtonText}>{t('haveaccount')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* OTP Modal - Moved outside to be independent */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={otpVisible}
        onRequestClose={() => {
            // Android back button handling
            Alert.alert("Cancel Verification?", "Are you sure you want to cancel?", [
                { text: "No" }, { text: "Yes", onPress: () => setOtpVisible(false) }
            ])
        }}
      >
        <View style={styles.otpOverlay}>
          <View style={styles.otpModal}>
            <Text style={styles.otpTitle}>{t('verifyemail')}</Text>
            <Text style={styles.otpSubtitle}>{t('sentto')} {email}</Text>
            <Text style={styles.timerText}>
              {t('timeremaining')} {formatTime(timer)}
            </Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder={t('otpcode')}
              placeholderTextColor="#666"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
            />
            
            <View style={styles.otpButtonRow}>
              {!otpSent ? (
                <TouchableOpacity onPress={sendEmailOtp} style={styles.otpButton}>
                  {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.otpButtonText}>{t('sendotp')}</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={verifyOtp} style={styles.otpButton} disabled={verifyLoading}>
                  {verifyLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.otpButtonText}>{t('verify')}</Text>}
                </TouchableOpacity>
              )}
              
              <TouchableOpacity onPress={() => setOtpVisible(false)} style={[styles.otpButton, { backgroundColor: '#999' }]}>
                <Text style={styles.otpButtonText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  formContainer: { flex: 1, padding: 20 },
  // Removed fixed width/maxwidth to allow responsiveness on all devices
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  input: { height: 45, borderColor: '#ccc', borderWidth: 1, borderRadius: 15, marginBottom: 8, paddingHorizontal: 10, backgroundColor: '#fff', color: '#000' },
  error: { color: 'red', fontSize: 13, marginBottom: 8, marginLeft: 4 },
  button: { backgroundColor: '#007bff', padding: 12, borderRadius: 15, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  loginButton: { marginTop: 15, alignItems: 'center', marginBottom: 20 },
  loginButtonText: { color: '#007bff', textDecorationLine: 'underline', fontSize: 15 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderColor: '#ccc', borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, backgroundColor: '#fff', marginBottom: 8 },
  passwordInput: { flex: 1, height: 45, color: '#000' },
  toggleButtonInside: { padding: 5 },
  imageUploadButton: { backgroundColor: '#eaeaea', padding: 12, borderRadius: 15, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#ddd' },
  imageButtonText: { color: '#333' },
  pickerContainer: { borderColor: '#ccc', borderWidth: 1, borderRadius: 15, marginBottom: 8, backgroundColor: '#fff' },
  previewImage: { width: 150, height: 100, borderRadius: 8, marginBottom: 10, alignSelf: 'center', backgroundColor: '#e1e1e1' },
  
  // OTP Styles
  otpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  otpModal: { backgroundColor: 'white', padding: 20, borderRadius: 15, width: '100%', maxWidth: 350, elevation: 10 },
  otpTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', color: '#333' },
  otpSubtitle: { textAlign: 'center', marginBottom: 15, color: '#666' },
  timerText: { textAlign: 'center', marginBottom: 15, color: '#d9534f', fontWeight: 'bold' },
  otpInput: { height: 50, borderColor: '#007bff', borderWidth: 1.5, borderRadius: 15, marginBottom: 20, paddingHorizontal: 10, backgroundColor: '#fff', color: '#000', fontSize: 18, textAlign: 'center', letterSpacing: 5 },
  otpButtonRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  otpButton: { flex: 1, backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  otpButtonText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  
  inputError: { borderColor: 'red', borderWidth: 1 },
  
  phoneContainer: { flexDirection: 'row', alignItems: 'center', borderColor: '#ccc', borderWidth: 1, borderRadius: 15, backgroundColor: '#fff', marginBottom: 8, paddingHorizontal: 10 },
  phonePrefix: { fontSize: 16, color: '#333', marginRight: 10, fontWeight: '500' },
  phoneInput: { flex: 1, height: 45, color: '#000' },
  
  // Password Strength Styles
  passwordStrengthContainer: { marginBottom: 10, paddingHorizontal: 4 },
  strengthBarBackground: { flex: 1, height: 6, backgroundColor: '#e0e0e0', borderRadius: 15, marginRight: 10, overflow: 'hidden' },
  strengthBarFill: { height: '100%', borderRadius: 3 },
  strengthText: { fontSize: 12, fontWeight: 'bold' },
  criteriaContainer: { marginTop: 4 },
  criteriaText: { fontSize: 12, marginBottom: 2 },
  metCriteria: { color: 'green' },
  unmetCriteria: { color: '#888' },
});

export default RegisterScreen;