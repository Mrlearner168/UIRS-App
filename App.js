import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN } from "@env";
import { Ionicons } from '@expo/vector-icons';
import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { getFocusedRouteNameFromRoute, NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import MapboxGL from '@rnmapbox/maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform, // Added
  Text, // Added
  TouchableOpacity, // Added
  Vibration,
  View
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
// Added missing import for EncryptedStorage used in App component
import EncryptedStorage from 'react-native-encrypted-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootSiblingParent } from 'react-native-root-siblings';
import { AuthContext, AuthProvider } from './src/context/AuthContext';
import { IncidentStationMapProvider } from './src/context/IncidentStationMapContext';
import { SocketProvider } from './src/context/SocketContext';
import { ToastProvider } from './src/context/ToastContext';
import { useFCMToken } from './src/hook/useFCMToken';
import { useGlobalIncidentListener } from './src/hook/useGlobalIncidentListener';

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

// Import Screens
import ResponderLocationTracking from './src/hook/ResponderLocationTracking';
import AddStationScreen from './src/screens/AddStationScreen';
import AdminPanel from './src/screens/AdminPanel';
import AdminRemarks from './src/screens/AdminRemarks';
import Dashboard1 from './src/screens/Dashboard';
import Graph from './src/screens/Graph';
import Login from './src/screens/Login';
import UsersData from './src/screens/ManageUser';
import NewUserValidation from './src/screens/NewUserValidation';
import Profile from './src/screens/Profile';
import Register from './src/screens/Register';
import ReportIncident from './src/screens/ReportIncident';
import Reports from './src/screens/Reports';
import RequestScreen from './src/screens/RequestScreen';
import ResponderPanel from './src/screens/ResponderDashboard';
import TrackLocationScreen from './src/screens/TrackLocationScreen';
import UpdatesScreen from './src/screens/UpdatesScreen';


const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const { AutoStartModule, OverlayPermissionModule } = NativeModules;
function AppInitializer({ initialProps }) {
  // listener mounts once
  useGlobalIncidentListener();
  
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator initialProps={initialProps} />
      <ResponderLocationTracking />
    </GestureHandlerRootView>
  );
}

//Dashboard tabs
function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === "Home") {
            iconName = "home";
          } else if (route.name === "Profile") {
            iconName = "person";
          } else if (route.name === "Report") {
            iconName = "add-circle";
          } else if (route.name === "Event Updates") {
            iconName = "refresh"; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={Dashboard1}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Report"
        component={ReportIncident}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Event Updates"
        component={UpdatesScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
//add edit delete station tabs
function HomeTabs1() {
  const navigation = useNavigation(); // now you get navigation here
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={AddStationScreen} 
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }}  />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//Graph Tabs 
function HomeTabs3() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={Graph} options={{ headerShown: false }} />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }}  />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//Admin Panel Tabs
function HomeTabs4() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={AdminPanel} options={{ headerShown: false }}  />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }} />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//UsersData Tabs
function HomeTabs5() {
  const navigation = useNavigation(); // now you get navigation here
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={UsersData} 
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }}  />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }}  />
    </Tab.Navigator>
  );
}
//Responders Tabs
function HomeTabs6() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={ResponderPanel} options={{ headerShown: false }} />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }} />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//Reports tabs 
function HomeTabs7() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name ="Home" component={Reports} options={{ headerShown: false }} />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }}  />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//request tabs
function HomeTabs8() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={RequestScreen} 
        options={{ headerShown: false }} 
      />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }} />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//New User Validation tabs
function HomeTabs9() {
  const navigation = useNavigation(); // now you get navigation here
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={NewUserValidation} 
        options={{ headerShown: false }}
      />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }} />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}
//admin post update 
function HomeTabs10() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = 'home';
          } else if (route.name === 'Profile') {
            iconName = 'person';
          } else if (route.name === 'Report') {
            iconName = 'add-circle';
          } else if (route.name === 'Event Updates') {
            iconName = 'refresh'; 
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={AdminRemarks} options={{ headerShown: false }} />
      <Tab.Screen name="Report" component={ReportIncident} options={{ headerShown: false }} />
      <Tab.Screen name="Event Updates" component={UpdatesScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={Profile} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

function getActiveRouteName(route) {
  return getFocusedRouteNameFromRoute(route) ?? 'Home';
}

//User Drawer
function DrawerNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Dashboard" options={{ headerShown: false }}>
      <Drawer.Screen name="Dashboard" component={HomeTabs} options={{ headerShown: false }}
      />
    </Drawer.Navigator>
  );
};
//admin Drawer
function DrawerNavigator1() {
  return (
    <Drawer.Navigator initialRouteName="Admin Dashboard" >
      <Drawer.Screen name="Admin Dashboard" component={HomeTabs4} options={({ route }) => {
        const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
      <Drawer.Screen name="Your Reports" component={HomeTabs7}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>

      <Drawer.Screen name="Post Update" component={HomeTabs10}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>

      <Drawer.Screen name="Graphs & Statistics Overview" component={HomeTabs3}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
      <Drawer.Screen name="Manage Users" component={HomeTabs5}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
      
      <Drawer.Screen name="Request Role Change" component={HomeTabs8}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
      <Drawer.Screen name="New User Request" component={HomeTabs9}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
      <Drawer.Screen name="Add/Edit/Delete Stations" component={HomeTabs1}  options={({ route }) => {
                const activeRouteName = getActiveRouteName(route);
        if (activeRouteName === 'Report' || activeRouteName === 'Profile' || activeRouteName === 'Event Updates') {
          return { headerShown: false };
        }
        return { headerShown: true };
      }}/>
    </Drawer.Navigator>
  );
}
//Responder Drawer
function CustomResponderDrawerContent(props) {
  const { authData } = useContext(AuthContext);

  return (
    <DrawerContentScrollView {...props}>
      <DrawerItem
        label="Responder Dashboard"
        onPress={() => props.navigation.navigate('Responder Dashboard')}
      />
      <DrawerItem
        label="Graphs & statistics Overview"
        onPress={() => props.navigation.navigate('Graphs & statistics Overview')}
      />
      <DrawerItem
        label="Your Reports"
        onPress={() => props.navigation.navigate('Your Reports')}
      />
      {authData.role === 'responder_head' && (
        <>
          <DrawerItem
            label="Request Role Change"
            onPress={() => props.navigation.navigate('Request Role Change')}
          />
          <DrawerItem
            label="Manage users"
            onPress={() => props.navigation.navigate('Manage Users')}
          />
        </>
      )}
    </DrawerContentScrollView>
  );
}
function DrawerNavigator2() {
  return (
    <Drawer.Navigator
      initialRouteName="Responder Dashboard"
      drawerContent={(props) => <CustomResponderDrawerContent {...props} />}
    >
      <Drawer.Screen name="Responder Dashboard" component={HomeTabs6} />
      <Drawer.Screen name="Graphs & statistics Overview" component={HomeTabs3} />
      <Drawer.Screen name="Your Reports" component={HomeTabs7} />
      <Drawer.Screen name="Request Role Change" component={HomeTabs8} />
      <Drawer.Screen name="Manage Users" component={HomeTabs5}/>
    </Drawer.Navigator>
  );
}
const commonScreens = (
  <>
    <Stack.Screen name="Login" component={Login} options={{ headerShown: false }} />
    <Stack.Screen name="UserHome" component={DrawerNavigator} options={{ headerShown: false }} />
    <Stack.Screen name="Register" component={Register} options={{ headerShown: false }} />
    <Stack.Screen name="AdminDashboard" component={DrawerNavigator1} options={{ headerShown: false }} />
    <Stack.Screen name="ResponderDashboard" component={DrawerNavigator2} options={{ headerShown: false }} />
    <Stack.Screen name="ReportIncident" component={ReportIncident} options={{ headerShown: false }} />
    <Stack.Screen name="TrackLocation" component={TrackLocationScreen} options={{ headerShown: false }} />
    <Stack.Screen name="YourReports" component={HomeTabs7} />
  </>
);
function RootNavigator({ initialProps }) {
  const { authData, loading } = useContext(AuthContext);
  const navigationRef = useRef(); 
  
  // 1. STATE FOR EMERGENCY MODAL
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [incidentData, setIncidentData] = useState(null);

  // 2. COMMON HANDLER FOR EMERGENCY ACTIVATION
  const activateEmergencyMode = (data) => {
    if (data?.is_emergency) {
      console.log("🚨 ACTIVATING EMERGENCY MODAL", data);
      setIncidentData(data);
      setEmergencyModalVisible(true);
      Vibration.vibrate([0, 500, 200, 500]); // Haptic feedback
    }
  };

  // 3. EFFECT: Handle "Cold Start" (App Launched from Dead State)
  useEffect(() => {
    if (initialProps?.is_emergency) {
      activateEmergencyMode(initialProps);
    }
  }, [initialProps]);

  // 4. EFFECT: Handle "Warm Start" (App in Background/Foreground)
  useEffect(() => {
    const deviceEventEmitter = new NativeEventEmitter(NativeModules.RCTDeviceEventEmitter);
    const subscription = deviceEventEmitter.addListener('onEmergencyNotification', (event) => {
      activateEmergencyMode(event);
    });
    return () => subscription.remove();
  }, []);

  // 5. EFFECT: Handle FCM Background/Terminated via React Native Firebase (Backup)
  useEffect(() => {
    const handleNavigation = (remoteMessage) => {
      if (remoteMessage?.data?.type === 'emergency') {
        activateEmergencyMode({...remoteMessage.data, is_emergency: true});
      }
    };

    messaging().getInitialNotification().then(handleNavigation);
    const unsubscribeOpen = messaging().onNotificationOpenedApp(handleNavigation);

    return () => {
      unsubscribeOpen();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <NavigationContainer ref={navigationRef}> 
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!authData?.token ? (
            <Stack.Screen name="Login1" component={Login} />
          ) : authData.role === 'user' ? (
            <Stack.Screen name="UserDashboard" component={DrawerNavigator} />
          ) : authData.role === 'admin' ? (
            <Stack.Screen name="AdminDashboard1" component={DrawerNavigator1} />
          ) : (authData.role === 'responder_head' || authData.role === 'responder_personnel') ? (
            <Stack.Screen name="ResponderDashboard1" component={DrawerNavigator2} />
          ) : (
            <Stack.Screen name="Login2" component={Login} />
          )}
          {commonScreens}
        </Stack.Navigator>
      </NavigationContainer>

      {/* 6. GLOBAL EMERGENCY MODAL */}
      <Modal 
        visible={emergencyModalVisible} 
        transparent={true} 
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setEmergencyModalVisible(false)} // Android Back Button
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25, alignItems: 'center', elevation: 10 }}>
            
            <Ionicons name="warning" size={60} color="#FF0000" />
            
            <Text style={{ fontSize: 22, fontWeight: 'bold', marginVertical: 10, color: '#FF0000', textAlign: 'center' }}>
              CRITICAL INCIDENT
            </Text>
            
            <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 16, color: '#333' }}>
              {incidentData?.body || "An emergency incident requires your immediate attention."}
            </Text>
            
            <TouchableOpacity 
              style={{ backgroundColor: '#FF0000', paddingVertical: 15, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 12 }}
              onPress={() => {
                setEmergencyModalVisible(false);
                // Navigate to Responder Dashboard
                if (navigationRef.current) {
                  navigationRef.current.navigate('ResponderDashboard1', { 
                    incidentData: incidentData 
                  });
                }
              }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>VIEW REPORT</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setEmergencyModalVisible(false)}
              style={{ padding: 10 }}
            >
              <Text style={{ color: '#666', fontSize: 14 }}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function App(props) {
  const fcmToken = useFCMToken();
  console.log('FCM Token:', fcmToken);

  useEffect(() => {
    const loadData = async () => {
      // 1. Load Language
      try {
        const lang = await EncryptedStorage.getItem('userLanguage');
        // Ensure i18n is imported or this line will throw if not defined globally
        if (lang && global.i18n) global.i18n.changeLanguage(lang);
      } catch (e) {
        console.log("Language load error:", e);
      }

      // 2. Request Permissions
      await requestAllPermissions();
    };
    
    loadData();
  }, []);
  
  const requestAllPermissions = async () => {
    console.log("Starting Robust Permission Check...");
  
    try {
      if (Platform.OS === 'android') {
      
        // ---------------------------------------------------------
        // 1. STANDARD ANDROID PERMISSIONS
        // ---------------------------------------------------------
        const permissionsToRequest = [
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, // Safe on RN 0.70+
        ].filter(Boolean);
      
        try {
          await PermissionsAndroid.requestMultiple(permissionsToRequest);
        } catch (e) { 
          console.warn("Standard perm error", e); 
        }
      
        // ---------------------------------------------------------
        // 2. EXPO PERMISSIONS (Safe Wrap)
        // ---------------------------------------------------------
        try { await Location.requestForegroundPermissionsAsync(); } catch(e) {}
        try { await ImagePicker.requestCameraPermissionsAsync(); } catch(e) {}
      
        // ---------------------------------------------------------
        // 3. OVERLAY / DRAW OVER APPS (Using Native Module)
        // ---------------------------------------------------------
        let canDraw = false;
        try {
            // Use your custom module for a reliable check
            canDraw = await OverlayPermissionModule.isOverlayPermissionGranted();
        } catch (e) {
            console.warn("Overlay Check Failed:", e);
        }
      
        if (!canDraw) {
            Alert.alert(
                '⚠️ Screen Access Required',
                'To show the emergency screen immediately over other apps, please allow "Display over other apps".',
                [
                    { text: 'Later', style: 'cancel' },
                    { 
                        text: 'Go to Settings', 
                        onPress: async () => {
                            // Use your custom module to open the direct page
                            try {
                                await OverlayPermissionModule.requestOverlayPermission();
                            } catch (e) {
                                Linking.openSettings();
                            }
                        } 
                    }
                ]
            );
        }
      
        // ---------------------------------------------------------
        // 4. SOUND / DND PERMISSION
        // ---------------------------------------------------------
        // Check if we can bypass DND (Do Not Disturb)
        const settings = await notifee.getNotificationSettings();
        if (settings.android.alarm !== 1) { // 1 = Authorized
            Alert.alert(
                '⚠️ Sound Permission',
                'To ensure the alarm rings loudly even in Silent/DND mode, please allow "Alarms & Reminders" or "DND Access".',
                [
                    { text: 'Later', style: 'cancel' },
                    { 
                        text: 'Go to Settings', 
                        onPress: () => Linking.sendIntent('android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS')
                    }
                ]
            );
        }
      
        // ---------------------------------------------------------
        // 5. AUTOSTART (Manufacturer Specific)
        // ---------------------------------------------------------
        const hasVerifiedAutostart = await EncryptedStorage.getItem('autostart_verified_v2'); 
        const brand = DeviceInfo.getBrand().toLowerCase();
        const aggressiveBrands = ['vivo', 'oppo', 'xiaomi', 'redmi', 'realme', 'huawei', 'honor', 'iqoo', 'oneplus'];
        
        // Only ask if it's a known brand AND we haven't asked before
        if (aggressiveBrands.includes(brand) && !hasVerifiedAutostart) {
          Alert.alert(
            `🚨 Action Required for ${brand.toUpperCase()}`,
            `To ensure the alarm rings when the app is closed, you MUST enable "Autostart".\n\n1. Tap "Configure Now"\n2. Find this app in the list\n3. Turn ON the switch`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'CONFIGURE NOW',
                onPress: async () => {
                  // Save that we asked, so we don't spam the user every time
                  await EncryptedStorage.setItem('autostart_verified_v2', 'true');
                  
                  // Use your custom AutoStart Module
                  try {
                    const success = await AutoStartModule.openAutoStartSettings();
                    if (!success) {
                        // If specific intent failed, fallback to app details
                        Linking.openSettings();
                    }
                  } catch (e) {
                    console.warn("Autostart module failed", e);
                    Linking.openSettings();
                  }
                }
              }
            ],
            { cancelable: false }
          );
        }
      
      }
    } catch (err) {
      console.error('CRITICAL: Permission Flow Failed', err);
    }
};
  function MainApp() {
    const fcmToken = useFCMToken(); // hook runs only if logged in
    console.log('FCM token:', fcmToken);
  }

  return (
    <RootSiblingParent>
      <AuthProvider>
        <IncidentStationMapProvider>
          <SocketProvider>
            <ToastProvider>
              <AppInitializer initialProps={props} />
              <MainApp />
            </ToastProvider>
          </SocketProvider>
        </IncidentStationMapProvider>
      </AuthProvider>
    </RootSiblingParent>
  );
}