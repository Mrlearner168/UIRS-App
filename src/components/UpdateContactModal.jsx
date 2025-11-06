import { SERVER_URL } from '@env';
import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';

const UpdateContactModal = ({ visible, onClose, contactType = 'email', userId, currentContact }) => {
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    //console.log("user_id",userId );
    //console.log("new contact", currentContact);
    //console.log("contact type", contactType);
    //console.log("otp" , otp);

  const handleVerifyOTP = async () => {
    if (!otp) {
      Alert.alert('Error', 'Enter the OTP');
      return;
    }

    setLoading(true);
    try {
      const token = await EncryptedStorage.getItem('token');
      const response = await fetch(`${SERVER_URL}/verify_change_otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          contactType,
          currentContact,
          otp,
        }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('Success', `${contactType} updated successfully`);
        onClose(true)
      } else {
        Alert.alert('Error', data.message || 'OTP verification failed');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    } finally {
      setLoading(false);
      setOtp('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <View style={styles.container}>
        <View style={styles.modal}>
          <Text style={styles.title}>Enter OTP for {contactType}</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            keyboardType="numeric"
            value={otp}
            onChangeText={setOtp}
          />
          <TouchableOpacity style={styles.button} onPress={handleVerifyOTP} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onClose(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '85%', backgroundColor: 'white', borderRadius: 12, padding: 25 },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, height: 40, marginBottom: 20 },
  button: { backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 8, marginBottom: 10 },
  buttonText: { color: 'white', fontSize: 16, textAlign: 'center', fontWeight: 'bold' },
  cancelText: { color: 'red', textAlign: 'center', marginTop: 10 }
});

export default UpdateContactModal;
