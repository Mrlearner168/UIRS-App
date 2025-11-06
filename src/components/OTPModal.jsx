import { SERVER_URL } from '@env';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const OTPModal = ({ visible, onClose, contact, isForgotPassword }) => {
  const [otp, setOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [verifyLoading, setVerifyLoading] = useState(true); // spinner while waiting for OTP send
  const [verifyEnabled, setVerifyEnabled] = useState(false);
  const [otpSent, setOtpSent] = useState(false); // track if OTP send succeeded

  useEffect(() => {
    if (visible && contact) {
      sendOtp();
    }
  }, [visible, contact]);

  useEffect(() => {
    let timer;
    if (resendTimer > 0) {
      timer = setTimeout(() => setResendTimer(prev => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendTimer]);

  const maskEmail = email => {
    const [name, domain] = email.split('@');
    const visible = name.slice(0, 2);
    const masked = '*'.repeat(Math.max(0, name.length - 2));
    return `${visible}${masked}@${domain}`;
  };

  const maskPhone = phone => {
    if (!phone) return '';
    const visibleStart = phone.slice(0, 2);
    const visibleEnd = phone.slice(-2);
    const maskedMiddle = '*'.repeat(Math.max(0, phone.length - 4));
    return `${visibleStart}${maskedMiddle}${visibleEnd}`;
  };

  const sendOtp = () => {
    setVerifyLoading(true);
    fetch(`${SERVER_URL}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setVerifyLoading(false);
          setVerifyEnabled(true);
          setOtpSent(true); // OTP sent successfully
          setResendTimer(120); // start timer
        } else {
          Alert.alert('Error', data.message || 'Failed to send OTP');
        }
      })
      .catch(() => Alert.alert('Error', 'Failed to send OTP'));
  };

  const handleVerify = () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid', 'Enter 6-digit code');
      return;
    }

    if (!verifyEnabled) return;

    setVerifyLoading(true);

    const url = isForgotPassword ? `${SERVER_URL}/verify-forgot` : `${SERVER_URL}/verify-otp`;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact, otp }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOtp('');
          onClose(true);
        } else {
          Alert.alert('Error', data.message || 'Invalid code');
          setOtp('');
        }
      })
      .catch(() => Alert.alert('Error', 'Something went wrong'))
      .finally(() => setVerifyLoading(false));
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    sendOtp();
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel',
      'Are you sure you want to cancel?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => onClose(false) },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.otpContainer}>
        <View style={styles.otpModal}>
          <Text style={styles.modaltitle}>
            {`Enter code sent to ${contact.includes('@') ? maskEmail(contact) : maskPhone(contact)}`}
          </Text>

          <TextInput
            style={styles.input}
            keyboardType="numeric"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleVerify}
            disabled={verifyLoading || !verifyEnabled}
          >
            {verifyLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{isForgotPassword ? 'Verify Code' : 'Verify'}</Text>
            )}
          </TouchableOpacity>

          {otpSent && (
            <TouchableOpacity
              onPress={handleResend}
              disabled={resendTimer > 0}
              style={{ marginTop: 10 }}
            >
              <Text style={{ textAlign: 'center', color: resendTimer > 0 ? 'gray' : '#007bff' }}>
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ textAlign: 'center', color: 'red', marginTop: 10 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  otpContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  otpModal: { width: '85%', backgroundColor: 'white', padding: 25, borderRadius: 12 },
  input: { height: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 5, paddingHorizontal: 10, marginBottom: 15 },
  button: { backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 8, marginBottom: 10 },
  buttonText: { color: 'white', fontSize: 16, textAlign: 'center', fontWeight: 'bold' },
  modaltitle: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 20 },
});

export default OTPModal;
