import messaging from '@react-native-firebase/messaging';
import { registerRootComponent } from 'expo';
import 'react-native-gesture-handler';
import App from './App';

/**
 * BACKGROUND DATA HANDLER
 * This handles the logic/data when the app is killed or in background.
 * Your Kotlin code is already showing the notification, so we 
 * ONLY use this for data processing or logging.
 */
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('FCM Data received in JS background:', remoteMessage.data);
    
    if (remoteMessage.data?.type === 'emergency') {
        // Example: You could save to a local database here 
        // or set a flag in storage.
        // DO NOT show a notification here.
    }
});

// Register the main App component
registerRootComponent(App);