import { createContext, useContext } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Toast from "react-native-toast-message";

const ToastContext = createContext();

export const ToastProvider = ({ children }) => {
  const showToast = (type, text1, text2) => {
    Toast.show({
      type,
      text1,
      text2,
      visibilityTime: 4000,
      autoHide: true,
      topOffset: 50,
    });
  };

  const showAlert = (title, message, buttons = [{ text: "OK", onPress: null }]) => {
    Toast.show({
      type: "custom_modal",
      position: "top",
      topOffset: 50,
      autoHide: false,
      props: {
        title,
        message,
        buttons,
      },
    });
  };

  return (
    <ToastContext.Provider value={{ showToast, showAlert }}>
      {children}
      <Toast
        config={{
          custom_modal: ({ props }) => (
            <View style={styles.modalContainer}>
              <Text style={styles.title}>{props.title}</Text>
              <Text style={styles.message}>{props.message}</Text>
              <View style={styles.buttonContainer}>
                {props.buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      btn.text === "Decline" ? styles.declineButton : null,
                    ]}
                    onPress={async () => {
                      if (btn.onPress) await btn.onPress();
                      Toast.hide();
                    }}
                  >
                    <Text style={styles.buttonText}>{btn.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ),
        }}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  title: { fontWeight: "bold", fontSize: 18, marginBottom: 8 },
  message: { fontSize: 16, marginBottom: 12 },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 4,
  },
  declineButton: {
    backgroundColor: "#D32F2F",
  },
  buttonText: { color: "white", fontSize: 16, fontWeight: "bold" },
});
