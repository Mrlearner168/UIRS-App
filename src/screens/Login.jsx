import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform, SafeAreaView, StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import NewPasswordModal from '../components/NewPasswordModal';
import OTPModal from '../components/OTPModal';
import TermsModal from '../components/Terms&RegulationsModal';
import { AuthContext, loading } from '../context/AuthContext';
import { getAppLanguage, setAppLanguage } from '../translation/i18nStorage';

const LOGIN_TIMEOUT = 15000; // 15 seconds


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
  const [language, setLanguage] = useState('en');
  
  // NEW: State to hold login data temporarily
  const [pendingLoginData, setPendingLoginData] = useState(null);

  const { t, i18n } = useTranslation();


  const handleRegister = () => {
    navigation.navigate('Register');
  };

  useEffect(() => {
    const syncLanguage = async () => {
      const savedLang = await getAppLanguage();
      setLanguage(savedLang);
    };
    syncLanguage();
  }, []);
  

  const handleLogin = async () => {
    if (isLocked) {
      Alert.alert('Account Locked', t('lockaccount'));
      setPassword('');
      return;
    }

    if (!contact || !password) {
      Alert.alert('Login Failed', t('incorrectcredentials'));
      return;
    }

    setIsLoggingIn(true);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), LOGIN_TIMEOUT);

    try {
      // Parallel API calls for faster authentication
      const response = await Promise.race([
        fetch(`${SERVER_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact, password }),
          signal: abortController.signal,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Login request timeout')), LOGIN_TIMEOUT)
        )
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Login failed');
      }

      const data = await response.json();

      if (data.status === 'inactive') {
        Alert.alert('Validation', t('validateaccount'));
        setPassword('');
        setIsLoggingIn(false);
        clearTimeout(timeoutId);
        return;
      }

      // Login successful - clear fields immediately
      setContact('');
      setPassword('');
      setLoginAttempts(0);

      // --- CHANGE START ---
      // Do NOT call login() yet. Store data and show terms first.
      setPendingLoginData(data); 
      setUserRole(data.role);
      setName(data.name);
      setShowTerms(true);
      // --- CHANGE END ---

    } catch (error) {
      console.error('Login error:', error.message);
      
      const attempts = loginAttempts + 1;
      setLoginAttempts(attempts);
      
      // Lock account after 3 failed attempts
      if (attempts >= 3) {
        setIsLocked(true);
        Alert.alert('Account Locked', 'Too many login attempts. Please try again in 1 minute.');
        setTimeout(() => setIsLocked(false), 60000);
      } else {
        const remainingAttempts = 3 - attempts;
        if (remainingAttempts > 0) {
          Alert.alert('Login Failed', `${t('incorrectcredentials')}. ${remainingAttempts} attempts remaining.`);
        } else {
          Alert.alert('Login Failed', t('incorrectcredentials'));
        }
      }
      
      // Clear password on failure for security
      setPassword('');
    } finally {
      setIsLoggingIn(false);
      clearTimeout(timeoutId);
    }
  };

  const handleAcceptTerms = async () => {
    setShowTerms(false);
    
    // --- CHANGE START ---
    // Perform the actual login logic here after they click accept
    if (pendingLoginData) {
        await login(
            pendingLoginData.token,
            pendingLoginData.refresh_token,
            pendingLoginData.id,
            pendingLoginData.role,
            pendingLoginData.status,
            pendingLoginData.station_id,
            pendingLoginData.is_head
        );
    }
    // --- CHANGE END ---

    Alert.alert('Welcome' , `${t('welcome')} ${name}`);
    
    // Reset form state
    setContact('');
    setPassword('');
    setLoginAttempts(0);
    
    // Note: If your 'login' function in Context automatically switches 
    // the navigation stack (e.g. from AuthStack to AppStack), 
    // these explicit navigate calls might be redundant, but we keep them just in case.
    if (userRole === "admin") {
      navigation.navigate("AdminDashboard");
    } else if (userRole === "responder_head" || userRole === "responder_personnel" ) {
      navigation.navigate("ResponderDashboard");
    } else if (userRole === "user"){
      navigation.navigate("UserHome");
    } else {
      // Alert.alert('Reminder' , t('infoncomplete')); 
      // If logic falls here, ensure they are still navigated somewhere or logged in
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
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
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
        <View style={styles.formContainer}>
          <Text style={styles.title}>{t('login')}</Text>
    
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput
            style={[styles.input,{ backgroundColor: '#fff', color: '#000' } ]}
            placeholder={t('emailplaceholder')}
            placeholderTextColor="#000"
            value={contact}
            onChangeText={setContact}
            keyboardType="email-address"
            autoCapitalize="none"
          />
  
          <Text style={styles.label}>{t('password')}</Text>
          <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.passwordInput, { backgroundColor: '#fff', color: '#000' } ]}
            placeholder={t('passwordplaceholder')}
            placeholderTextColor="#000"
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
            disabled={isLoggingIn || isLocked}
          >
            {isLoggingIn ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color="white" size="small" />
                <Text style={{ color: 'white', marginLeft: 8, fontWeight: 'bold' }}>Logging in...</Text>
              </View>
            ) : (
              <Text style={styles.loginButtonText}>{t('login')}</Text>
            )}
          </TouchableOpacity>
          
          
          <View style={styles.linksContainer}>
          <TouchableOpacity
            onPress={() => {
              if (!contact) {
                Alert.alert(t('emailplaceholder'), t('emptyemailphone'));
                return;
              }
            
              // detect type
              const isEmail = /\S+@\S+\.\S+/.test(contact);
              const isPhone = /^\d{10,15}$/.test(contact.replace(/\D/g, '')); // numeric only, 10-15 digits
            
              if (!isEmail && !isPhone) {
                Alert.alert('Invalid', t('invalidemailphone'));
                return;
              }
              setOtpContact(contact);       // pass to OTP modal
              setIsForgotPassword(true);
              setOtpVisible(true);
            }}
          >
            <Text style={styles.linkText}>{t('forgotPassword')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleRegister}>
            <Text style={styles.linkText}>{t('signUp')}</Text>
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
    </SafeAreaView>
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
    borderRadius: 15,
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
    borderRadius: 15,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 15,
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
    borderRadius: 25,
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
  languageContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    width: 130,
    zIndex: 20,
    borderRadius: 15,
    padding: 1,
  },
  languagePicker: {
    color: 'black',
    width: '100%',
    height: 50,
    marginRight: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 15,
    
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

export default LoginScreen;