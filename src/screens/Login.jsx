import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import { useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import NewPasswordModal from '../components/NewPasswordModal';
import OTPModal from '../components/OTPModal';
import TermsModal from '../components/Terms&RegulationsModal';
import { AuthContext, loading } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const { login } = useContext(AuthContext);
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpContact, setOtpContact] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [newPassVisible, setNewPassVisible] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [userRole , setUserRole] = useState (null);
  const [name , setName] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);


  const handleRegister = () => {
    navigation.navigate('Register');
  };

  const handleLogin = async () => {
    if (isLocked) {
      Alert.alert('Account Locked', 'Too many failed login attempts. Try again later.');
      setPassword('');
      return;
    }

    if (!contact || !password) {
      Alert.alert('Login Failed', 'Enter both email/phone and password.');
      return;
    }

    setIsLoggingIn(true); // start spinner

    try {
      const contactCheckResponse = await fetch(`${SERVER_URL}/check_contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });

      if (!contactCheckResponse.ok) {
        const errorText = await contactCheckResponse.text();
        throw new Error(errorText);
      }

      const contactCheckData = await contactCheckResponse.json();

      if (!contactCheckData.exists) {
        Alert.alert('No Account', 'No account registered with this email or phone.');
        setPassword('');
        return;
      }

      const response = await fetch(`${SERVER_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, password }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();

      if (data.status === 'inactive') {
        Alert.alert('Validation', 'Your account is being validated. Please wait.');
        setPassword('');
        return;
      }

      await login(
        data.token,
        data.refresh_token,
        data.id,
        data.role,
        data.status,
        data.station_id,
        data.is_head
      );

      setUserRole(data.role);
      setName(data.name);
      setShowTerms(true);
    } catch (error) {
      const attempts = loginAttempts + 1;
      setLoginAttempts(attempts);
      if (attempts >= 3) {
        setIsLocked(true);
        setTimeout(() => setIsLocked(false), 60000);
      }
      Alert.alert('Login Failed', 'Invalid email/phone or password.');
      setPassword('');
    } finally {
      setIsLoggingIn(false); // stop spinner
    }
  };

  
  const handleAcceptTerms = () => {
    setShowTerms(false);
    Alert.alert('Welcome ' , `Welcome ${name}`);
    if (userRole === "admin") {
      navigation.navigate("AdminDashboard");
    } else if (userRole === "responder_head" ||userRole === "responder_personnel" ) {
      navigation.navigate("ResponderDashboard");
    } else if (userRole === "user"){
      navigation.navigate("UserHome");
    }else {
      Alert.Alert('Reminder' , "Your are not Registered ❗")
    }
  }; 


  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Loading...</Text>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.formContainer}>
        <Text style={styles.title}>Login</Text>

        <Text style={styles.label}>Email or Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email/phone"
          value={contact}
          onChangeText={setContact}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
          />
          <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
            <Ionicons
              name={passwordVisible ? 'eye-off' : 'eye'}
              size={22}
              color="gray"
              style={styles.eyeIcon}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={isLoggingIn} // prevent multiple clicks
        >
          {isLoggingIn ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </TouchableOpacity>
        

        <View style={styles.linksContainer}>
          <TouchableOpacity
            onPress={() => {
              if (!contact) {
                Alert.alert('Enter Email or Phone', 'Please enter your email or phone first');
                return;
              }
            
              // detect type
              const isEmail = /\S+@\S+\.\S+/.test(contact);
              const isPhone = /^\d{10,15}$/.test(contact.replace(/\D/g, '')); // numeric only, 10-15 digits
            
              if (!isEmail && !isPhone) {
                Alert.alert('Invalid', 'Enter a valid email or phone number');
                return;
              }
              setOtpContact(contact);       // pass to OTP modal
              setIsForgotPassword(true);
              setOtpVisible(true);
            }}
          >
            <Text style={styles.linkText}>Forgot Password?</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleRegister}>
            <Text style={styles.linkText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
      <OTPModal
        visible={otpVisible}
        contact={otpContact}
        isForgotPassword={isForgotPassword}
        onClose={(success) => {
          setOtpVisible(false);
          if (success) {
            setNewPassVisible(true); // open new password modal
            setIsForgotPassword(false);
          }
        }}
      />

      {/* NewPasswordModal*/}
      <NewPasswordModal
        visible={newPassVisible}
        contact={otpContact}
        onClose={() => setNewPassVisible(false)}
      />

      <TermsModal
        visible={showTerms}
        onClose={() => setShowTerms(false)}
        onAccept={handleAcceptTerms}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    padding: 20,
  },
  formContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#555',
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  passwordInput: {
    flex: 1,
    height: 40,
  },
  eyeIcon: {
    marginLeft: 10,
  },
  loginButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  linkText: {
    color: '#007bff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
