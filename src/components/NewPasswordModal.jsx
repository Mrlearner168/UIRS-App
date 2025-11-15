import { SERVER_URL } from '@env';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const NewPasswordModal = ({ visible, onClose, contact }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', t('pleasefillallfields'));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', t('passwordmismatch'));
      return;
    }

    if (loading) return;
    setLoading(true);

    fetch(`${SERVER_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact, new_password: confirmPassword }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          Alert.alert('Success', t('passwordupdated'));
          onClose(true);
          setConfirmPassword('');
          setNewPassword('');
        } else {
          Alert.alert('Error', t('failedtoupdatepassword'));
        }
      })
      .catch(() => Alert.alert('Error', 'Something went wrong'))
      .finally(() => setLoading(false));
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel',
      t('cancelpass'),
      [
        { text: t('no'), style: 'cancel' },
        { text: t('yes'), onPress: () => onClose(false) }
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <View style={styles.container}>
        <View style={styles.modalBox}>
          <Text style={styles.title}>{t('resetpass')}</Text>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('newpassword')}
              placeholderTextColor={"#888"}
              secureTextEntry={!newVisible}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity onPress={() => setNewVisible(!newVisible)}>
              <Ionicons
                name={newVisible ? 'eye-off' : 'eye'}
                size={22}
                color="gray"
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('confirmpassword')}
              placeholderTextColor={"#888"}
              secureTextEntry={!confirmVisible}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <TouchableOpacity onPress={() => setConfirmVisible(!confirmVisible)}>
              <Ionicons
                name={confirmVisible ? 'eye-off' : 'eye'}
                size={22}
                color="gray"
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>{t('submit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCancel}>
            <Text style={{ textAlign: 'center', color: 'red', marginTop: 10 }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { width: '85%', backgroundColor: 'white', padding: 25, borderRadius: 12 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 20 },
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
  passwordInput: { flex: 1, height: 40 , backgroundColor: '#fafafa', color: '#000' },
  eyeIcon: { marginLeft: 10 },
  button: { backgroundColor: '#007bff', paddingVertical: 12, borderRadius: 8, marginBottom: 10 },
  buttonText: { color: 'white', fontSize: 16, textAlign: 'center', fontWeight: 'bold' },
});

export default NewPasswordModal;
