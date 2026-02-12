import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CheckBox } from "react-native-elements";

export default function TermsModal({ visible, onClose, onAccept }) {
  const [checked, setChecked] = useState(false);
  const { t } = useTranslation();

  const handleCancel = () => {
    Alert.alert(
      t('termsrequired') || 'Terms Required',
      t('mustacceptterms') || 'You must accept the terms and regulations to continue.',
      [
        {
          text: t('cancel') || 'Cancel',
          onPress: () => {},
          style: 'cancel',
        }
      ]
    );
  };

  return (
    <Modal 
      animationType="slide" 
      transparent 
      visible={visible}
      onRequestClose={() => {
        // Prevent closing on back button
        handleCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Terms and Regulations</Text>
            <ScrollView style={styles.scroll}>
              <Text style={styles.content}>• {t('rule1')}</Text>
              <Text style={styles.content}>• {t('rule2')}</Text>

              <Text style={styles.content}>• {t('rule3')}</Text>
              <Text style={styles.content}>• {t('rule4')}</Text>

              <Text style={styles.content}>•{t('rule5')}</Text>
              <Text style={styles.content}>• {t('rule6')}</Text>

              <Text style={styles.content}>• {t('rule7')}</Text>
              <Text style={styles.content}>• {t('rule8')}</Text>

              <Text style={styles.content}>• {t('rule9')}</Text>
              <Text style={styles.content}>• {t('rule10')}</Text>

              <Text style={styles.content}>• {t('rule11')}</Text>
            </ScrollView>
          <View style={styles.checkboxRow}>
            <CheckBox
              checked={checked}
              onPress={() => setChecked(!checked)}
              containerStyle={{ padding: 0, margin: 0 }}
            />
            <Text style={styles.checkboxText}>{t('termsagree')}</Text>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { opacity: checked ? 1 : 0.5 }]}
              onPress={() => {
                if (checked) {
                  setChecked(false);
                  onAccept();
                }
              }}
              disabled={!checked}
            >
              <Text style={styles.acceptText}>{t('acceptrequest')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  scroll: {
    marginBottom: 15,
    maxHeight: 300,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  checkboxText: {
    fontSize: 14,
    color: "#444",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cancelBtn: {
    flex: 1,
    marginRight: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#eee",
    alignItems: "center",
  },
  acceptBtn: {
    flex: 1,
    marginLeft: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#007BFF",
    alignItems: "center",
  },
  cancelText: {
    color: "#333",
    fontSize: 15,
  },
  acceptText: {
    color: "white",
    fontSize: 15,
    fontWeight: "bold",
  },
});
