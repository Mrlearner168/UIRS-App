import { RNMAPBOX_MAPS_DOWNLOAD_TOKEN } from "@env";
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import MapboxGL from '@rnmapbox/maps';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  DeviceEventEmitter,
  Modal,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import EncryptedStorage from 'react-native-encrypted-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootSiblingParent } from 'react-native-root-siblings';
import { AuthContext, AuthProvider } from './src/context/AuthContext';
import { IncidentStationMapProvider } from './src/context/IncidentStationMapContext';
import { ToastProvider } from './src/context/ToastContext';
import { PermissionService } from './src/services/PermissionService';

// Import Screens & Hooks
import ResponderLocationTracking from './src/hook/ResponderLocationTracking';
import { useFCMToken } from './src/hook/useFCMToken';
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

MapboxGL.setAccessToken(RNMAPBOX_MAPS_DOWNLOAD_TOKEN);

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// --- ⚙️ SHARED NAVIGATION COMPONENTS ---

const TabIcon = (name, color, size) => <Ionicons name={name} size={size} color={color} />;

const createTabScreenOptions = ({ route }) => ({
  tabBarIcon: ({ color, size }) => {
    let iconName;
    if (route.name === "Home") iconName = "home";
    else if (route.name === "Profile") iconName = "person";
    else if (route.name === "Report") iconName = "add-circle";
    else if (route.name === "Event Updates") iconName = "refresh";
    return TabIcon(iconName, color, size);
  },
  headerShown: false,
});

const GenericTabNavigator = (MainComponent) => (
  <Tab.Navigator screenOptions={createTabScreenOptions}>
    <Tab.Screen name="Home" component={MainComponent} />
    <Tab.Screen name="Report" component={ReportIncident} />
    <Tab.Screen name="Event Updates" component={UpdatesScreen} />
    <Tab.Screen name="Profile" component={Profile} />
  </Tab.Navigator>
);

// Individual Tab Stacks matching App-new.js logic
const HomeTabs = () => GenericTabNavigator(Dashboard1);
const HomeTabs1 = () => GenericTabNavigator(AddStationScreen);
const HomeTabs3 = () => GenericTabNavigator(Graph);
const HomeTabs4 = () => GenericTabNavigator(AdminPanel);
const HomeTabs5 = () => GenericTabNavigator(UsersData);
const HomeTabs6 = () => GenericTabNavigator(ResponderPanel);
const HomeTabs7 = () => GenericTabNavigator(Reports);
const HomeTabs8 = () => GenericTabNavigator(RequestScreen);
const HomeTabs9 = () => GenericTabNavigator(NewUserValidation);
const HomeTabs10 = () => GenericTabNavigator(AdminRemarks);

// --- 📁 DRAWER NAVIGATORS ---

function getActiveRouteName(route) {
  return getFocusedRouteNameFromRoute(route) ?? 'Home';
}

const hideHeaderOnTabs = ({ route }) => {
  const activeRouteName = getActiveRouteName(route);
  const isTabScreen = ['Report', 'Profile', 'Event Updates'].includes(activeRouteName);
  return { headerShown: !isTabScreen };
};

// User Drawer
function DrawerNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Dashboard" screenOptions={{ headerShown: false }}>
      <Drawer.Screen name="Dashboard" component={HomeTabs} />
    </Drawer.Navigator>
  );
}

// Admin Drawer
function DrawerNavigator1() {
  return (
    <Drawer.Navigator initialRouteName="Admin Dashboard">
      <Drawer.Screen name="Admin Dashboard" component={HomeTabs4} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Your Reports" component={HomeTabs7} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Post Update" component={HomeTabs10} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Graphs & Statistics Overview" component={HomeTabs3} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Manage Users" component={HomeTabs5} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Request Role Change" component={HomeTabs8} options={hideHeaderOnTabs} />
      <Drawer.Screen name="New User Request" component={HomeTabs9} options={hideHeaderOnTabs} />
      <Drawer.Screen name="Add/Edit/Delete Stations" component={HomeTabs1} options={hideHeaderOnTabs} />
    </Drawer.Navigator>
  );
}

// Responder Drawer Content
function CustomResponderDrawerContent(props) {
  const { authData } = useContext(AuthContext);
  return (
    <DrawerContentScrollView {...props}>
      <DrawerItem label="Responder Dashboard" onPress={() => props.navigation.navigate('Responder Dashboard')} />
      <DrawerItem label="Graphs & statistics Overview" onPress={() => props.navigation.navigate('Graphs & statistics Overview')} />
      <DrawerItem label="Your Reports" onPress={() => props.navigation.navigate('Your Reports')} />
      {authData?.role === 'responder_head' && (
        <>
          <DrawerItem label="Request Role Change" onPress={() => props.navigation.navigate('Request Role Change')} />
          <DrawerItem label="Manage users" onPress={() => props.navigation.navigate('Manage Users')} />
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
      <Drawer.Screen name="Manage Users" component={HomeTabs5} />
    </Drawer.Navigator>
  );
}

// --- 🚀 ROOT NAVIGATION & LOGIC ---

const commonScreens = (
  <>
    <Stack.Screen name="Login" component={Login} />
    <Stack.Screen name="UserHome" component={DrawerNavigator} />
    <Stack.Screen name="Register" component={Register} />
    <Stack.Screen name="AdminDashboard" component={DrawerNavigator1} />
    <Stack.Screen name="ResponderDashboard" component={DrawerNavigator2} />
    <Stack.Screen name="ReportIncident" component={ReportIncident} />
    <Stack.Screen name="TrackLocation" component={TrackLocationScreen} />
    <Stack.Screen name="YourReports" component={HomeTabs7} />
  </>
);

function RootNavigator() {
  const { authData, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#D32F2F" />
      </View>
    );
  }

  return (
    <NavigationContainer>
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
  );
}

function AppInitializer({ initialProps }) {
  const { authData } = useContext(AuthContext);
  const { SharedPrefModule } = NativeModules;

  useEffect(() => {
    const manageNativeService = async () => {
      try {
        if (Platform.OS !== 'android' || !SharedPrefModule) return;
        if (authData?.token) {
          const dataToSave = {
            userId: String(authData.id),
            isHead: String(authData.is_head),
            role: String(authData.role || ""),
            stationId: String(authData.station_id || authData.stationId || ""),
            status: String(authData.status || ""),
            token: String(authData.token)
          };
          await SharedPrefModule.saveData(dataToSave);
        } else if (!authData) {
          await SharedPrefModule.clearDataAndStopService();
        }
      } catch (error) {
        console.error(`Native Handoff Failure: ${error.message}`);
      }
    };
    manageNativeService();
  }, [authData]);

  useEffect(() => {
    if (initialProps?.is_emergency || initialProps?.incident_id) {
      setTimeout(() => DeviceEventEmitter.emit('ON_NATIVE_EMERGENCY_LAUNCH', initialProps), 1000);
    }
  }, [initialProps]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
      <ResponderLocationTracking />
    </GestureHandlerRootView>
  );
}

// --- 🏥 HEALTH DASHBOARD COMPONENT ---

const HealthDashboard = ({ visible, health, onFix, onClose, loading }) => {
  if (!health) return null;

  const renderItem = (label, isGranted, type, description) => (
    <View style={styles.itemRow}>
      <View style={[styles.iconBadge, { backgroundColor: isGranted ? '#E8F5E9' : '#FFEBEE' }]}>
        <Text style={{ fontSize: 18 }}>{isGranted ? "✅" : "⚠️"}</Text>
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{label}</Text>
        <Text style={styles.itemDesc}>{description}</Text>
      </View>
      {!isGranted && (
        <TouchableOpacity 
          style={styles.fixBtnSmall} 
          onPress={() => onFix(type)}
        >
          <Text style={styles.fixBtnText}>FIX</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Calculate if we can allow the user to close the modal
  // We force them to stay if Runtime permissions (Camera/Loc) are missing.
  const canSkip = health.runtimeGranted; 

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>System Check</Text>
            <Text style={styles.modalSubtitle}>
              {health.isRobust ? "System is ready for emergencies." : "Setup required for reliability."}
            </Text>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* 1. CRITICAL RUNTIME */}
            {renderItem(
              "Essential Permissions", 
              health.runtimeGranted, 
              "runtime", 
              "Camera, Microphone, Location, & Notifications"
            )}

            {/* 2. BACKGROUND RELIABILITY */}
            {renderItem(
              "Background Launch", 
              health.overlayGranted, 
              "overlay", 
              "Allows alerts to appear over other apps"
            )}
            
            {renderItem(
              "Battery Unrestricted", 
              health.batteryGranted, 
              "battery", 
              "Prevents the system from killing the app"
            )}

            {/* 3. AUTOSTART (Complex Logic) */}
            {health.hiddenRisks?.isHighRiskDevice && (
              renderItem(
                "Auto-Start / Boot", 
                health.hiddenRisks.manualCheckRequired 
                  ? (health.hiddenRisks.userIgnoredAutostart ? true : false) // If ignored, show green/accepted
                  : health.hiddenRisks.miuiAutoStartGranted, 
                "autostart", 
                "Ensures app restarts after phone reboot"
              )
            )}

            {/* 4. ADVANCED */}
            {renderItem(
              "Do Not Disturb Access", 
              health.dndGranted, 
              "dnd", 
              "Allows alerts to play sound even in silent mode"
            )}

             {/* 5. FULL SCREEN INTENT (Android 14+) */}
             {Platform.Version >= 34 && renderItem(
              "Full Screen Alerts", 
              health.fsiGranted, 
              "fsi", 
              "Required for Lock Screen popups on Android 14"
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            {canSkip ? (
               <TouchableOpacity style={styles.continueBtn} onPress={onClose}>
                 <Text style={styles.continueBtnText}>
                    {health.isRobust ? "Everything Looks Good" : "I'll Fix Later"}
                 </Text>
               </TouchableOpacity>
            ) : (
              <View style={styles.blockedContainer}>
                <Text style={styles.blockedText}>Essential permissions are required to continue.</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function App(props) {
  const fcmToken = useFCMToken(); 
  
  const [healthReport, setHealthReport] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const appState = useRef(AppState.currentState);

  // --- CORE SYSTEM CHECK ---
  const performSystemCheck = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);

      // 1. Language Load
      const lang = await EncryptedStorage.getItem('userLanguage');
      if (lang && global.i18n) global.i18n.changeLanguage(lang);

      // 2. Check Permissions
      const health = await PermissionService.checkHealth();
      
      // 3. Inject User Preference for "Manual Check" Devices (Oppo/Vivo)
      const ignoredAutostart = await EncryptedStorage.getItem('ignore_autostart_alert');
      if (health && health.hiddenRisks) {
         health.hiddenRisks.userIgnoredAutostart = (ignoredAutostart === 'true');
      }

      // 4. Update State
      setHealthReport(health);

      // 5. Decide to Show Dashboard
      // Show if: Not Robust OR (High Risk Device AND Not Ignored)
      const isAutoStartIssue = health.hiddenRisks?.isHighRiskDevice 
                               && !health.hiddenRisks?.miuiAutoStartGranted 
                               && !health.hiddenRisks?.userIgnoredAutostart;
      
      if (!health.isRobust || isAutoStartIssue) {
          setShowDashboard(true);
      } else {
          // If everything is great, we can hide it (unless user opened it manually later)
          setShowDashboard(false);
      }
    } catch (e) {
      console.error("System Check Error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    performSystemCheck();

    // Re-check on App Resume (returning from Settings)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log("🔄 App foregrounded: Re-checking permissions...");
        performSystemCheck(true); // Silent check
      }
      appState.current = nextAppState;
    });

    const emergencySub = DeviceEventEmitter.addListener('onEmergencyNotification', (data) => {
      console.log("🚨 Emergency Data:", data);
    });

    return () => {
      subscription.remove();
      emergencySub.remove();
    };
  }, []);

  // --- HANDLERS ---
  const handleFix = async (type) => {
    // 1. Handle Autostart Logic specifically
    if (type === 'autostart' && healthReport?.hiddenRisks?.manualCheckRequired) {
        // For Oppo/Vivo: We send them to settings, but we can't verify the result.
        // We ask them if they did it.
        Alert.alert(
            "Enable Auto-Start",
            "We will take you to settings. Please find this app and enable 'Auto-Start' or 'High Background Power'.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Go to Settings", 
                    onPress: async () => {
                        await PermissionService.fixPermission('autostart');
                        // After a delay (simulating return), ask confirmation
                        setTimeout(() => {
                             Alert.alert(
                                 "Did you enable it?",
                                 "We cannot verify this setting automatically.",
                                 [
                                     { text: "No, take me back", onPress: () => handleFix('autostart') },
                                     { 
                                         text: "Yes, I did", 
                                         onPress: async () => {
                                             await EncryptedStorage.setItem('ignore_autostart_alert', 'true');
                                             performSystemCheck(true);
                                         }
                                     }
                                 ]
                             );
                        }, 1000);
                    }
                }
            ]
        );
        return;
    }

    // 2. Standard Fix
    await PermissionService.fixPermission(type);
    
    // 3. Special handling for Runtime: It has its own dialog, we need to wait a bit
    if (type === 'runtime') {
       // The app will pause here while system dialogs show. 
       // The AppState listener will catch the return and refresh.
    }
  };

  function MainApp() {
    const fcmToken = useFCMToken(); 
    return null; 
  }

  return (
    <RootSiblingParent>
      <AuthProvider>
        <IncidentStationMapProvider>
            <ToastProvider>
              <AppInitializer initialProps={props} />
              <MainApp />
              
              {/* PROFESSIONAL DASHBOARD */}
              <HealthDashboard 
                visible={showDashboard} 
                health={healthReport}
                loading={isLoading}
                onFix={handleFix}
                onClose={() => setShowDashboard(false)}
              />

            </ToastProvider>
        </IncidentStationMapProvider>
      </AuthProvider>
    </RootSiblingParent>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '100%', maxHeight: '85%', backgroundColor: 'white', borderRadius: 20, overflow: 'hidden' },
  modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 22, fontWeight: 'bold' },
  modalSubtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  modalBody: { padding: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '600' },
  itemDesc: { fontSize: 12, color: '#888' },
  fixBtnSmall: { backgroundColor: '#D32F2F', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  fixBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#EEE' },
  continueBtn: { backgroundColor: '#333', padding: 15, borderRadius: 12, alignItems: 'center' },
  continueBtnText: { color: 'white', fontWeight: 'bold' },
  blockedText: { color: '#D32F2F', textAlign: 'center' }
});