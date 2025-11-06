import { SERVER_URL } from '@env';
import { Picker } from '@react-native-picker/picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const RegisterScreen = ({ navigation }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [idType, setIdType] = useState('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [age, setAge] = useState('');
  const [frontIdImage, setFrontIdImage] = useState(null);
  const [backIdImage, setBackIdImage] = useState(null);
  const [selfieImage, setSelfieImage] = useState(null);

  const [errors, setErrors] = useState({});
  const [timer, setTimer] = useState(300); // 5 minutes in seconds
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [checkingContact, setCheckingContact] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const compressImage = async (uri) => {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.WEBP } // WebP and 70% quality
      );
      return result.uri;
    } catch (err) {
      console.log("Image compression error:", err);
      return uri;
    }
  };
  const pickImageForField = async (setImageField) => {
    Alert.alert(
      "Select Image Source",
      "Choose an option to upload your image.",
      [
        {
          text: "Camera",
          onPress: async () => {
            let result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 1,
            });
            if (!result.canceled) {
              const compressedUri = await compressImage(result.assets[0].uri);
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              setImageField({
                uri: compressedUri,
                type: "image/webp",
                fileName: `camera_image_${timestamp}.webp`,
              });
            }
          },
        },
        {
          text: "Gallery",
          onPress: async () => {
            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 1,
            });
            if (!result.canceled) {
              const compressedUri = await compressImage(result.assets[0].uri);
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              setImageField({
                uri: compressedUri,
                type: "image/webp",
                fileName: `gallery_image_${timestamp}.webp`,
              });
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };
  const validateInputs = () => {
    const newErrors = {};

    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';
    else if (!/^9\d{9}$/.test(phoneNumber)) newErrors.phoneNumber = 'Enter a valid PH number (e.g., 9XXXXXXXXX)';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email format';
    if (!age.trim() || isNaN(age) || parseInt(age) <= 0) newErrors.age = 'Enter a valid age';
    if (!idNumber.trim()) newErrors.idNumber = 'ID number is required';
    else {
      let pattern;
      switch (idType) {
        case 'National ID':
        case 'Voter\'s ID':
          pattern = /^\d{15}$/;
          break;
        case 'Passport':
          pattern = /^[A-Z]\d{7}[A-Z]$/i;
          break;
        case "Driver's License":
          pattern = /^[A-Z]{1,2}-\d{7,12}$/i;
          break;
        case 'Student\'s ID':
          pattern = /^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/i;
          break;
      }
      if (!pattern.test(idNumber)) newErrors.idNumber = `Invalid ${idType} format`;
    }
    if (!frontIdImage) newErrors.frontIdImage = 'Upload front ID';
    if (!backIdImage) newErrors.backIdImage = 'Upload back ID';
    if (!selfieImage) newErrors.selfieImage = 'Upload selfie with ID';
    if (!password.trim()) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'At least 8 characters';
    else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(password))
      newErrors.password = 'Include upper, lower, number, and symbol';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };
  const verifyOtp = async () => {
    if (!email || !otpCode) {
      Alert.alert('Error', 'Please enter your email and OTP.');
      return;
    }

    setVerifyLoading(true); // disable button and show spinner

    try {
      const response = await fetch(`${SERVER_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: email, otp: otpCode }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setOtpVerified(true);
        setOtpVisible(false);
        setOtpSent(false);
        setOtpCode('');
        Alert.alert('Verified', 'Email verified successfully.');
        handleAddUser();
      } else if (data.message === 'OTP expired') {
        Alert.alert('OTP Expired', 'Your OTP has expired. Would you like to resend it?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resend', onPress: sendEmailOtp },
        ]);
      } else {
        Alert.alert('Invalid OTP', data.message || 'Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to verify OTP.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const checkContactExists = async (contact) => {
    try {
      const response = await fetch(`${SERVER_URL}/check_contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });
      const data = await response.json();
      return data.exists;
    } catch (err) {
      Alert.alert('Error', 'Unable to validate contact info.');
      return true;
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
          newErrors.email = 'Email already registered';
          Alert.alert('Duplicate Email', 'This email is already registered.');
        }
        if (phoneExists) {
          newErrors.phoneNumber = 'Phone number already registered';
          Alert.alert('Duplicate Phone', 'This phone number is already registered.');
        }
        setErrors((prev) => ({ ...prev, ...newErrors }));
        return;
      }
      
      if (!otpVerified) {
        setOtpVisible(true);
        if (!otpSent) sendEmailOtp();
        return;
      }

      handleAddUser();
    } catch (error) {
      Alert.alert('Error', 'Failed to check contact info.');
    } finally {
      setCheckingContact(false);
    }
  };

  const sendEmailOtp = async () => {
    if (!email) return;
  
    const emailExists = await checkContactExists(email);
    if (emailExists) {
      Alert.alert('Error', 'Email already registered.');
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
        Alert.alert('OTP Sent', 'Check your email for the code.', [
          {
            text: 'OK',
            onPress: () => {
              setOtpVisible(true); // show OTP modal
              setTimer(300); // reset 5 minutes
            
              const interval = setInterval(() => {
                setTimer(prev => {
                  if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
          }
        ]);
      } else {
        Alert.alert('Error', data.error || 'Failed to send OTP.', [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Retry',
            onPress: sendEmailOtp
          }
        ]);
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to send OTP.');
    } finally {
      setOtpLoading(false);
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
      formData.append('frontIdImage', { uri: frontIdImage.uri, name: frontIdImage.fileName, type: frontIdImage.type });
      formData.append('backIdImage', { uri: backIdImage.uri, name: backIdImage.fileName, type: backIdImage.type });
      formData.append('selfieImage', { uri: selfieImage.uri, name: selfieImage.fileName, type: selfieImage.type });

      const response = await fetch(`${SERVER_URL}/add_user`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', 'Registration successful!');
        navigation.navigate("Login");
      } else {
        Alert.alert('Error', data.error || 'Registration failed.');
      }
    } catch (err) {
      Alert.alert('Error', 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.formContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Register</Text>

          <TextInput
            style={[styles.input, errors.firstName && styles.inputError]}
            placeholder="First Name"
            value={firstName}
            onChangeText={(text) => {
              setFirstName(text);
              if (errors.firstName) setErrors({ ...errors, firstName: '' });
            }}
          />
          {errors.firstName && <Text style={styles.error}>{errors.firstName}</Text>}
          
          <TextInput
            style={[styles.input, errors.lastName && styles.inputError]}
            placeholder="Last Name"
            value={lastName}
            onChangeText={(text) => {
              setLastName(text);
              if (errors.lastName) setErrors({ ...errors, lastName: '' });
            }}
          />
          {errors.lastName && <Text style={styles.error}>{errors.lastName}</Text>}
          
          <View style={styles.phoneContainer}>
            <Text style={styles.phonePrefix}>+63</Text>
            <TextInput
              style={[styles.phoneInput, errors.phoneNumber && styles.inputError]}
              placeholder="9XXXXXXXXX"
              value={phoneNumber}
              onChangeText={(text) => {
                let cleaned = text.replace(/[^0-9]/g, '').slice(0, 10);
                // Prevent 0 as the first digit
                if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                setPhoneNumber(cleaned);
                if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: '' });
              }}
              keyboardType="number-pad"
            />
          </View>
          {errors.phoneNumber && <Text style={styles.error}>{errors.phoneNumber}</Text>}
            
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="Email"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            keyboardType="email-address"
          />
          {errors.email && <Text style={styles.error}>{errors.email}</Text>}
          
          <TextInput
            style={styles.input}
            placeholder="Age"
            value={age}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '').slice(0, 3);
              setAge(cleaned);
              if (errors.age) setErrors({ ...errors, age: '' });
            }}
            keyboardType="numeric"
          />
          {errors.age && <Text style={styles.error}>{errors.age}</Text>}
          
          <Text style={styles.label}>Select ID Type</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={idType} onValueChange={(val) => setIdType(val)}>
              <Picker.Item label="National ID" value="National ID" />
              <Picker.Item label="Passport" value="Passport" />
              <Picker.Item label="Driver's License" value="Driver's License" />
              <Picker.Item label="Voter's ID" value="Voter's ID" />
              <Picker.Item label="Student's ID" value="Student's ID" />
            </Picker>
          </View>

          <TextInput
            style={styles.input}
            placeholder={
              idType === 'National ID' || idType === "Voter's ID" ? '15-digit number' :
              idType === 'Passport' ? '6-9 characters' :
              idType === "Driver's License" ? 'e.g., A1234567' :
              '4-15 characters'
            }
            value={idNumber}
            onChangeText={setIdNumber}
          />
          {errors.idNumber && <Text style={styles.error}>{errors.idNumber}</Text>}

          <TouchableOpacity onPress={() => pickImageForField(setFrontIdImage)} style={styles.imageUploadButton}>
            <Text>{frontIdImage ? '✅ Front ID Selected' : '📤 Upload Front of ID'}</Text>
          </TouchableOpacity>
          {errors.frontIdImage && <Text style={styles.error}>{errors.frontIdImage}</Text>}
          {frontIdImage && <Image source={{ uri: frontIdImage.uri }} style={styles.previewImage} />}

          <TouchableOpacity onPress={() => pickImageForField(setBackIdImage)} style={styles.imageUploadButton}>
            <Text>{backIdImage ? '✅ Back ID Selected' : '📤 Upload Back of ID'}</Text>
          </TouchableOpacity>
          {errors.backIdImage && <Text style={styles.error}>{errors.backIdImage}</Text>}
          {backIdImage && <Image source={{ uri: backIdImage.uri }} style={styles.previewImage} />}

          <TouchableOpacity onPress={() => pickImageForField(setSelfieImage)} style={styles.imageUploadButton}>
            <Text>{selfieImage ? '✅ Selfie Uploaded' : '📤 Upload Selfie with ID'}</Text>
          </TouchableOpacity>
          {errors.selfieImage && <Text style={styles.error}>{errors.selfieImage}</Text>}
          {selfieImage && <Image source={{ uri: selfieImage.uri }} style={styles.previewImage} />}

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.toggleButtonInside}>
              <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="gray" />
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={styles.error}>{errors.password}</Text>}

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.toggleButtonInside}>
              <Ionicons name={showConfirmPassword ? "eye-off" : "eye"} size={22} color="gray" />
            </TouchableOpacity>
          </View>
          {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword}</Text>}

          <TouchableOpacity
            style={[styles.button, (checkingContact || otpLoading || loading) && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={checkingContact || otpLoading || loading}
          >
            {checkingContact || otpLoading || loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </TouchableOpacity>
          
          
          <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.loginButtonText}>Already have an account? Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {otpVisible && (
        <View style={styles.otpOverlay}>
          <View style={styles.otpModal}>
            <Text style={styles.otpTitle}>Email Verification</Text>
            <Text style={styles.otpSubtitle}>Enter the OTP sent to {email}</Text>
            <Text style={{ textAlign: 'center', marginBottom: 10, color: '#333' }}>
              Time remaining: {formatTime(timer)}
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="Enter OTP"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="numeric"
            />
            <View style={styles.otpButtonRow}>
              {!otpSent ? (
                <TouchableOpacity onPress={sendEmailOtp} style={styles.otpButton}>
                  {otpLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.otpButtonText}>Send OTP</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={verifyOtp} style={styles.otpButton} disabled={verifyLoading}>
                  {verifyLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.otpButtonText}>Verify</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setOtpVisible(false)} style={[styles.otpButton, { backgroundColor: '#999' }]}>
                <Text style={styles.otpButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', padding: 20 },
  formContainer: { backgroundColor: 'white', padding: 20, borderRadius: 8, width: '100%', maxWidth: 400, elevation: 5 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  input: { height: 45, borderColor: '#ccc', borderWidth: 1, borderRadius: 4, marginBottom: 8, paddingHorizontal: 10, backgroundColor: '#f8f8f8' },
  error: { color: 'red', fontSize: 13, marginBottom: 8, marginLeft: 4 },
  button: { backgroundColor: '#007bff', padding: 12, borderRadius: 4, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  loginButton: { marginTop: 10, alignItems: 'center' },
  loginButtonText: { color: '#007bff', textDecorationLine: 'underline' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderColor: '#ccc', borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, backgroundColor: '#f8f8f8', marginBottom: 8 },
  passwordInput: { flex: 1, height: 45 },
  toggleButtonInside: { position: 'absolute', right: 10 },
  imageUploadButton: { backgroundColor: '#eaeaea', padding: 10, borderRadius: 4, alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  pickerContainer: { borderColor: '#ccc', borderWidth: 1, borderRadius: 4, marginBottom: 8, backgroundColor: '#f8f8f8' },
  scrollContent: { paddingVertical: 6 },
  previewImage: { width: 100, height: 90, borderRadius: 8, marginBottom: 4, alignSelf: 'center' },
  otpOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  otpModal: { backgroundColor: 'white', padding: 20, borderRadius: 8, width: '85%', maxWidth: 350, elevation: 5 },
  otpTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  otpSubtitle: { textAlign: 'center', marginBottom: 15, color: '#666' },
  otpInput: { height: 45, borderColor: '#ccc', borderWidth: 1, borderRadius: 4, marginBottom: 10, paddingHorizontal: 10, backgroundColor: '#f8f8f8' },
  otpButtonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  otpButton: { flex: 1, backgroundColor: '#007bff', padding: 10, borderRadius: 4, alignItems: 'center', marginHorizontal: 4 },
  otpButtonText: { color: 'white', fontWeight: 'bold' },
  inputError: {
    borderColor: 'red',
    borderWidth: 1.5,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#f8f8f8',
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  phonePrefix: {
    fontSize: 16,
    color: '#333',
    marginRight: 5,
  },
  phoneInput: {
    flex: 1,
    height: 45,
  },

  
});

export default RegisterScreen;
