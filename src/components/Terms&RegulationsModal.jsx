import { useState } from "react";
import {
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

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Terms and Regulations</Text>
            <ScrollView style={styles.scroll}>
              <Text style={styles.content}>• Users are required to provide accurate, complete, and up-to-date information when submitting incident reports.</Text>
              <Text style={styles.content}>• Users are solely responsible for maintaining the confidentiality of their account credentials and all activities conducted under their account.</Text>

              <Text style={styles.content}>• Submission of false, misleading, or fraudulent information is strictly prohibited and may result in account suspension, termination, or legal action.</Text>
              <Text style={styles.content}>• All reported data may be reviewed, verified, and shared with authorized emergency and cybersecurity response agencies to facilitate effective incident management.</Text>

              <Text style={styles.content}>• Users must refrain from attempting to disrupt, exploit, or gain unauthorized access to the system, including uploading malicious files or harmful content.</Text>
              <Text style={styles.content}>• Any misuse of the platform, intentional or otherwise, may result in immediate account suspension and possible legal consequences.</Text>

              <Text style={styles.content}>• Personal data collected is processed in compliance with applicable data protection laws and is used exclusively for communication, coordination, and incident response purposes.</Text>
              <Text style={styles.content}>• User data will not be sold, leased, or shared with unauthorized third parties under any circumstances.</Text>

              <Text style={styles.content}>• Users are obligated to comply with all applicable national and local laws when accessing and using the system.</Text>
              <Text style={styles.content}>• The administrators reserve the right to suspend or terminate access at their discretion in the event of violations of these terms.</Text>

              <Text style={styles.content}>• By checking the acceptance box and proceeding, users acknowledge that they have read, understood, and agree to be bound by these Terms and Regulations.</Text>
            </ScrollView>
          <View style={styles.checkboxRow}>
            <CheckBox
              checked={checked}
              onPress={() => setChecked(!checked)}
              containerStyle={{ padding: 0, margin: 0 }}
            />
            <Text style={styles.checkboxText}>I agree to the terms</Text>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { opacity: checked ? 1 : 0.5 }]}
              onPress={() => checked && onAccept()}
              disabled={!checked}
            >
              <Text style={styles.acceptText}>Accept</Text>
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
