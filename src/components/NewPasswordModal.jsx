import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react'; // Added React import
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- SUB-COMPONENT (Moved outside to prevent focus loss) ---
const PasswordInput = ({ 
  placeholder, 
  value, 
  onChange, 
  visible, 
  onToggle, 
  isFocused, // Received as a boolean prop
  onFocus,   // Handler
  onBlur     // Handler
}) => (
  <View style={[
    styles.inputWrapper, 
    isFocused && styles.inputWrapperFocused,
    value && !visible && styles.inputWrapperFilled
  ]}>
    <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
    <TextInput
      style={styles.textInput}
      placeholder={placeholder}
      placeholderTextColor="#999"
      secureTextEntry={!visible}
      value={value}
      onChangeText={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      autoCapitalize="none"
      autoCorrect={false}
    />
    <TouchableOpacity onPress={onToggle} style={styles.eyeBtn}>
      <Ionicons 
        name={visible ? 'eye-off-outline' : 'eye-outline'} 
        size={22} 
        color={visible ? '#007AFF' : '#999'} 
      />
    </TouchableOpacity>
  </View>
);

const NewPasswordModal = ({ visible, onClose, contact }) => {
  const { t } = useTranslation();
  
  // State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewVisible, setIsNewVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState({ score: 0, label: '', color: '#e0e0e0' });
  const [focusedInput, setFocusedInput] = useState(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setNewPassword('');
      setConfirmPassword('');
      setStrength({ score: 0, label: '', color: '#e0e0e0' });
      setLoading(false);
      setFocusedInput(null);
    }
  }, [visible]);

  // Password Strength Logic
  const calculateStrength = (pass) => {
    let score = 0;
    if (!pass) return { score: 0, label: '', color: '#e0e0e0' };

    if (pass.length > 5) score++;
    if (pass.length > 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return { score: 1, label: t('weak') || 'Weak', color: '#FF3B30' }; // Red
    if (score <= 4) return { score: 2, label: t('medium') || 'Medium', color: '#FF9500' }; // Orange
    if (score >= 5) return { score: 3, label: t('strong') || 'Strong', color: '#34C759' }; // Green
    
    return { score: 0, label: '', color: '#e0e0e0' };
  };

  const handlePasswordChange = (text) => {
    setNewPassword(text);
    const result = calculateStrength(text);
    // Wrap LayoutAnimation in a try-catch for safety
    try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {
        // Handle animation errors silently
    }
    setStrength(result);
  };

  const handleClose = (success = false) => {
    setNewPassword('');
    setConfirmPassword('');
    onClose(success);
  };

  const handleCancel = () => {
    Alert.alert(
      t('cancel') || 'Cancel',
      t('cancelpass') || 'Are you sure you want to cancel?',
      [
        { text: t('no') || 'No', style: 'cancel' },
        { text: t('yes') || 'Yes', onPress: () => handleClose(false) }
      ]
    );
  };

  const handleSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing Fields', t('pleasefillallfields') || 'Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', t('passwordmismatch') || 'Passwords do not match.');
      return;
    }

    if (strength.score < 2) {
      Alert.alert('Weak Password', t('passwordtooweak') || 'Please choose a stronger password.');
      return;
    }

    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${SERVER_URL}/reset-password`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          contact: String(contact), 
          new_password: String(newPassword) 
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('Success', t('passwordupdated') || 'Password updated successfully.', [
          { text: 'OK', onPress: () => handleClose(true) }
        ]);
      } else {
        throw new Error(data.message || t('failedtoupdatepassword') || 'Failed to update password.');
      }

    } catch (error) {
      let errorMessage = 'Something went wrong. Please try again.';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={28} color="#007AFF" />
            </View>
            <Text style={styles.title}>{t('resetpass') || 'Reset Password'}</Text>
            <Text style={styles.subtitle}>
              {'Create a strong password to secure your account.'}
            </Text>
          </View>

          {/* Inputs */}
          <View style={styles.form}>
            <PasswordInput
              placeholder={t('newpassword') || 'New Password'}
              value={newPassword}
              onChange={handlePasswordChange}
              visible={isNewVisible}
              onToggle={() => setIsNewVisible(!isNewVisible)}
              isFocused={focusedInput === 'new'}
              onFocus={() => setFocusedInput('new')}
              onBlur={() => setFocusedInput(null)}
            />

            {/* Strength Indicator */}
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthTrack}>
                  <View 
                    style={[
                      styles.strengthBar, 
                      { 
                        width: `${(strength.score / 3) * 100}%`,
                        backgroundColor: strength.color 
                      }
                    ]} 
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {strength.label}
                </Text>
              </View>
            )}

            <PasswordInput
              placeholder={t('confirmpassword') || 'Confirm Password'}
              value={confirmPassword}
              onChange={setConfirmPassword}
              visible={isConfirmVisible}
              onToggle={() => setIsConfirmVisible(!isConfirmVisible)}
              isFocused={focusedInput === 'confirm'}
              onFocus={() => setFocusedInput('confirm')}
              onBlur={() => setFocusedInput(null)}
            />
          </View>

          {/* Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.btn, styles.btnCancel]} 
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={styles.btnTextCancel}>{t('cancel') || 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.btn, 
                styles.btnSubmit,
                (loading || strength.score < 2) && styles.btnDisabled
              ]} 
              onPress={handleSubmit}
              disabled={loading || strength.score < 2}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.btnTextSubmit}>{t('submit') || 'Update'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputWrapperFocused: {
    borderColor: '#007AFF',
    backgroundColor: '#FFF',
  },
  inputWrapperFilled: {
    borderColor: '#C7C7CC',
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    height: '100%',
  },
  eyeBtn: {
    padding: 8,
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -8,
    paddingHorizontal: 4,
  },
  strengthTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#F2F2F7',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 10,
  },
  strengthBar: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 60,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#F2F2F7',
  },
  btnSubmit: {
    backgroundColor: '#007AFF',
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: '#A0A0A0',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  btnTextSubmit: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default NewPasswordModal;