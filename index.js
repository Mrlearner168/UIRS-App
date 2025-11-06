import { registerRootComponent } from 'expo';
import App from './App';

import notifee, { AndroidImportance } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';

// Handle FCM in background/quit state
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('FCM background:', remoteMessage);

  if (!remoteMessage.notification) {
    await notifee.displayNotification({
      title: remoteMessage.data?.title || 'UIRS',
      body: remoteMessage.data?.body || 'New background message',
      android: {
        channelId: 'default',
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
      },
    });
  }
});

// Required: Notifee background event handler (taps, dismiss)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('Notifee background event:', type, detail);
});

// Register main app
registerRootComponent(App);
