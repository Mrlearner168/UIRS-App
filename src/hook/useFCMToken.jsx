// hooks/useFCMToken.js
import { SERVER_URL } from '@env';
import messaging from '@react-native-firebase/messaging';
import { useContext, useEffect, useState } from 'react';
import EncryptedStorage from 'react-native-encrypted-storage';
import { AuthContext } from '../context/AuthContext';

export function useFCMToken() {
  const [token, setToken] = useState(null);

  // fallback to {} if context is missing
  const context = useContext(AuthContext) || {};
  const authData = context.authData;

  async function sendToBackend(fcmToken) {
    try {
      const authToken = await EncryptedStorage.getItem("token");
      if (!authToken) {
        console.log("No auth token, user not logged in");
        return;
      }

      await fetch(`${SERVER_URL}/save_fcm_token`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fcm_token: fcmToken,
          device_type: "android",
        }),
      });

      console.log("FCM token saved to backend");
    } catch (err) {
      console.log("Error sending FCM token to backend:", err);
    }
  }

  useEffect(() => {
    if (!authData?.token) {
      console.log("User not logged in, skipping FCM setup");
      return;
    }

    async function init() {
      try {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          const fcmToken = await messaging().getToken();
          console.log("FCM Token:", fcmToken);
          setToken(fcmToken);
          await sendToBackend(fcmToken);
        } else {
          console.log("FCM permission not granted");
        }
      } catch (error) {
        console.log("Error getting FCM token:", error);
      }
    }

    init();

    const unsubscribe = messaging().onTokenRefresh(async freshToken => {
      console.log("New FCM Token:", freshToken);
      setToken(freshToken);
      await sendToBackend(freshToken);
    });

    return unsubscribe;
  }, [authData?.token]);

  return token;
}
