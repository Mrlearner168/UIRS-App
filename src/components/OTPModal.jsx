import { SERVER_URL } from '@env';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

const OTPModal = ({ visible, onClose, contact, isForgotPassword }) => {
  const [otp, setOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
  const inputRef = useRef(null);
  const { t } = useTranslation();

  // Reset state and Send OTP when modal opens
  useEffect(() => {
    if (visible) {
      setOtp('');
      setOtpSent(false);
      setVerifyLoading(false);
      setResendTimer(0);
      if (contact) {
        sendOtp();
      }
    }
  }, [visible, contact]);

  // Timer Logic
  useEffect(() => {
    let timer;
    if (resendTimer > 0) {
      timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendTimer]);

  // Auto-submit when OTP reaches 6 digits
  useEffect(() => {
    if (otp.length === 6 && otpSent) {
      handleVerify();
    }
  }, [otp]);

  // SECURITY: Input Sanitizer
  const handleOtpChange = (text) => {
    // Strictly replace any character that is NOT a number (0-9)
    // This prevents SQL injection payloads like "1 OR 1=1" from being stored or sent.
    const numericValue = text.replace(/[^0-9]/g, '');
    setOtp(numericValue);
  };

  const maskContact = (info) => {
    if (!info) return '';
    if (info.includes('@')) {
      const [name, domain] = info.split('@');
      const visible = name.slice(0, 2);
      const masked = '•'.repeat(Math.max(0, name.length - 2));
      return `${visible}${masked}@${domain}`;
    } else {
      const visibleStart = info.slice(0, 2);
      const visibleEnd = info.slice(-2);
      const maskedMiddle = '•'.repeat(Math.max(0, info.length - 4));
      return `${visibleStart}${maskedMiddle}${visibleEnd}`;
    }
  };

  const sendOtp = async () => {
    if (!contact) return;
    setIsSendingOtp(true);
    
    try {
      // Note: Ensure your server uses Parameterized Queries for this endpoint!
      const response = await fetch(`${SERVER_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      });
      const data = await response.json();

      if (data.success) {
        setOtpSent(true);
        setResendTimer(60);
        // Focus the input automatically after sending for better UX
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        Alert.alert('Error', data.message || 'Failed to send OTP');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerify = async () => {
    // Double check length
    if (otp.length !== 6 || verifyLoading) return;

    setVerifyLoading(true);
    const url = isForgotPassword ? `${SERVER_URL}/verify-forgot` : `${SERVER_URL}/verify-otp`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sending sanitized 'otp' and 'contact'
        body: JSON.stringify({ contact, otp }),
      });
      const data = await response.json();

      if (data.success) {
        setOtp('');
        onClose(true); // Signal success to parent
      } else {
        Alert.alert('Verification Failed', data.message || 'Invalid code');
        setOtp(''); // Clear OTP on failure
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Something went wrong during verification');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    setOtp('');
    sendOtp();
  };

  const handleCancel = () => {
    Alert.alert(
      t('cancel_verification') || 'Cancel Verification',
      t('cancel_confirmation') || 'Are you sure you want to stop verifying?',
      [
        { text: t('no') || 'No', style: 'cancel' },
        { text: t('yes') || 'Yes', style: 'destructive', onPress: () => onClose(false) },
      ]
    );
  };

  // Render the 6 visual boxes based on the hidden input value
  const renderOtpBoxes = () => {
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      const digit = otp[i] || '';
      const isFocused = i === otp.length;
      boxes.push(
        <View
          key={i}
          style={[
            styles.otpBox,
            isFocused && styles.otpBoxFocused,
            digit && styles.otpBoxFilled,
          ]}
        >
          <Text style={styles.otpText}>{digit}</Text>
        </View>
      );
    }
    return boxes;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          {/* KeyboardAvoidingView pushes the modal up when keyboard opens */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoid}
          >
            <View style={styles.modalContainer}>
              
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <Text style={{ fontSize: 32 }}>🔒</Text>
              </View>

              <Text style={styles.title}>{'Verification Code'}</Text>
              
              <Text style={styles.subtitle}>
                {isSendingOtp
                  ? 'Sending code...'
                  : `${'Please enter the code sent to'}\n${maskContact(contact)}`}
              </Text>

              {/* Input Area */}
              <View style={styles.inputWrapper}>
                {/* HIDDEN INPUT: 
                  This invisible input sits on top of the visual boxes.
                  It handles all keyboard events, pasting, and backspacing natively.
                  It uses 'caretHidden' and 'opacity: 0' to remain invisible.
                */}
                <TextInput
                  ref={inputRef}
                  style={styles.hiddenInput}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={handleOtpChange} // Uses secure sanitizer
                  textContentType="oneTimeCode" // iOS Auto-fill
                  autoComplete="sms-otp" // Android Auto-fill
                  caretHidden={true}
                />
                
                {/* Visual Boxes: Tapping them focuses the hidden input */}
                <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
                  <View style={styles.otpBoxesContainer}>
                    {renderOtpBoxes()}
                  </View>
                </TouchableWithoutFeedback>
              </View>

              {/* Action Buttons */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.verifyButton, (otp.length !== 6 || verifyLoading) && styles.disabledButton]}
                  onPress={handleVerify}
                  disabled={otp.length !== 6 || verifyLoading}
                  activeOpacity={0.8}
                >
                  {verifyLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.verifyButtonText}>
                      {isForgotPassword ? 'Reset Password': 'Verify Identity'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.resendContainer}>
                  <Text style={styles.resendText}>Didn't receive code? </Text>
                  <TouchableOpacity disabled={resendTimer > 0} onPress={handleResend}>
                    <Text
                      style={[
                        styles.resendLink,
                        resendTimer > 0 && styles.resendLinkDisabled,
                      ]}
                    >
                      {resendTimer > 0 ? `${'Wait'} ${resendTimer}s` : ('Resend')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                  <Text style={styles.cancelText}>{t('cancel') || 'Cancel'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)', // Slightly darker for better focus
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoid: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    width: width * 0.9,
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    // Shadow for Android
    elevation: 10,
  },
  iconContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#F5F7FA',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 20,
  },
  inputWrapper: {
    width: '100%',
    height: 50,
    marginBottom: 30,
    position: 'relative', // Essential for absolute positioning of hidden input
  },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0, // Visually hide but keep interactive
    zIndex: 2, // Ensure it sits on top
  },
  otpBoxesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  otpBox: {
    width: '14%', // Flexible width
    height: 50,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  otpBoxFocused: {
    borderColor: '#007bff',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    // Add a subtle glow effect
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: '#007bff',
    backgroundColor: '#F0F8FF',
  },
  otpText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  footer: {
    width: '100%',
    alignItems: 'center',
  },
  verifyButton: {
    width: '100%',
    backgroundColor: '#007bff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#A0C4FF',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  resendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  resendText: {
    color: '#666',
    fontSize: 14,
  },
  resendLink: {
    color: '#007bff',
    fontWeight: '600',
    fontSize: 14,
  },
  resendLinkDisabled: {
    color: '#999',
  },
  cancelButton: {
    padding: 10,
  },
  cancelText: {
    color: '#FF3B30', // Standard iOS red for destructive actions
    fontSize: 14,
    fontWeight: '500',
  },
});

export default OTPModal;