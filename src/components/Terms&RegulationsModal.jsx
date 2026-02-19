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
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

export default function TermsModal({ visible, onClose, onAccept }) {
  const [checked, setChecked] = useState(false);
  const { t } = useTranslation();

  const handleCancel = () => {
    Alert.alert(
      'Terms Required',
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
      animationType="fade" 
      transparent 
      visible={visible}
      onRequestClose={() => {
        handleCancel();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}> {'Terms and Regulations'}</Text>
          <View style={styles.separator} />
          
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={true}>
            <View style={styles.contentContainer}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => (
                <View key={num} style={styles.ruleRow}>
                  <View style={styles.bulletContainer}>
                    <View style={styles.bulletPoint} />
                  </View>
                  <Text style={styles.content}>{t(`rule${num}`)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.separator} />

          <TouchableOpacity 
            activeOpacity={0.8}
            style={styles.checkboxRow} 
            onPress={() => setChecked(!checked)}
          >
            <View style={[styles.customCheckbox, checked && styles.customCheckboxChecked]}>
              {checked && <Icon name="check" size={16} color="#fff" />}
            </View>
            <Text style={styles.checkboxText}>{t('termsagree')}</Text>
          </TouchableOpacity>

          <View style={styles.buttons}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.acceptBtn, 
                { 
                  opacity: checked ? 1 : 0.6, 
                  backgroundColor: checked ? '#007BFF' : '#E5E7EB' 
                }
              ]}
              onPress={() => {
                if (checked) {
                  setChecked(false);
                  onAccept();
                }
              }}
              disabled={!checked}
              activeOpacity={0.7}
            >
              <Text style={[styles.acceptText, !checked && { color: '#9CA3AF' }]}>
                {t('acceptrequest') || 'Accept'}
              </Text>
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
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "white",
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 24,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
    textAlign: "center",
    color: "#111827",
    letterSpacing: 0.5,
  },
  separator: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 16,
  },
  scroll: {
    marginBottom: 16,
  },
  contentContainer: {
    paddingRight: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  bulletContainer: {
    marginTop: 8,
    marginRight: 12,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#007BFF",
  },
  content: {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
    color: "#0f1114",
    flex: 1,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  customCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  customCheckboxChecked: {
    backgroundColor: "#007BFF",
    borderColor: "#007BFF",
  },
  checkboxText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "600",
    flex: 1,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: 'center',
  },
  cancelText: {
    color: "#4B5563",
    fontSize: 16,
    fontWeight: "700",
  },
  acceptText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});