// DeclineModal.js
import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import RootSiblings from "react-native-root-siblings";


let sibling = null;

const DeclineModalContent = ({ incident, onSubmit, onCancel }) => {
  const [remarks, setRemarks] = useState("");
  const [incidentType] = useState(incident.incidentType || ""); 

  console.log("DeclineModalContent rendered for incident:", incident?.id);
  console.log("fetch incident type:" , incident?.incidentType);

  return (
    <View style={[styles.overlay, { zIndex: 9999 }]}>
      <View style={styles.modal}>
        <Text style={styles.title}>Decline Incident</Text>
        <Text style={styles.label}>Type: {incident.incidentType}</Text>
        <Text style={styles.label}>Sub-Type: {incident.subType}</Text>
        {incidentType === "Others" && (
          <Text style={styles.label}>Description: {incident.incidentDescription}</Text>
        )}
        <TextInput
          style={styles.input}
          placeholder="Reason for declining"
          value={remarks}
          onChangeText={setRemarks}
        />
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => {
              if (!remarks.trim()) {
                alert("Please state your Reasons");
                return;
              }
              console.log("Decline modal submitted for incident:", incident.id, "Remarks:", remarks);
              onSubmit(remarks);
            }}
          >
            <Text style={styles.btnText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Function to show modal globally
export default function showDeclineModal({ incident, onSubmit, onCancel }) {
  console.log("Opening decline modal for incident:", incident?.id);
  sibling = new RootSiblings(
    <DeclineModalContent
      incident={incident}
      onSubmit={(remarks) => {
        if (typeof onSubmit === "function") onSubmit(remarks);
        sibling?.destroy();
        sibling = null;
        console.log("Decline modal destroyed after submit");
      }}
      onCancel={() => {
        if (typeof onCancel === "function") onCancel();
        sibling?.destroy();
        sibling = null;
        console.log("Decline modal destroyed after cancel");
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  modal: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    zIndex: 10000,
    elevation: 10000,
  },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  label: { marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginVertical: 10 },
  buttons: { flexDirection: "row", justifyContent: "space-between" },
  cancelBtn: { backgroundColor: "#aaa", padding: 10, borderRadius: 8, flex: 1, marginRight: 5, alignItems: "center" },
  submitBtn: { backgroundColor: "#e53935", padding: 10, borderRadius: 8, flex: 1, marginLeft: 5, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold" },
});

