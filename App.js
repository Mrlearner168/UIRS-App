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
import NetworkAwareLabel from "./src/services/NetworkAwareTabLabel";
import { PermissionService } from './src/services/PermissionService';
// Import Screens & Hooks
import StationScreen from "./src/components/StationScreen";
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

// --- 🎨 THEME COLORS ---
const COLORS = {
  primary: '#E63946', // Vibrant modern red
  primaryLight: '#FFEBEE',
  success: '#2A9D8F',
  successLight: '#E8F5E9',
  warning: '#F4A261',
  textDark: '#1D3557',
  textLight: '#6C757D',
  background: '#F8F9FA',
  card: '#FFFFFF',
};

// --- ⚙️ SHARED NAVIGATION COMPONENTS ---

const TabIcon = (name, color, size) => <Ionicons name={name} size={size} color={color} />;

const createTabScreenOptions = ({ route }) => ({
  tabBarIcon: ({ color, size, focused }) => {
    let iconName;
    if (route.name === "Home") iconName = focused ? "home" : "home-outline";
    else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
    else if (route.name === "Report") iconName = focused ? "add-circle" : "add-circle-outline";
    else if (route.name === "Event Updates") iconName = focused ? "refresh-circle" : "refresh-circle-outline";
    
    // Make the active icon slightly larger for a dynamic feel
    return TabIcon(iconName, color, focused ? size + 4 : size);
  },
  headerShown: false,
  tabBarActiveTintColor: COLORS.primary,
  tabBarInactiveTintColor: COLORS.textLight,
  tabBarShowLabel: true,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600',
    paddingBottom: 1,
  },
  tabBarStyle: {
    backgroundColor: COLORS.card,
    height: Platform.OS === 'ios' ? 80 : 70, // Extra height for iOS home indicator
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0', // Soft top border
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 }, // Negative height casts shadow upwards
    shadowOpacity: 0.05,
    shadowRadius: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10, // Safe area padding
    paddingTop: 5,
  },
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

// --- 👑 ADMIN DRAWER CONTENT ---
function CustomAdminDrawerContent(props) {
  return (
    <DrawerContentScrollView {...props} style={styles.drawerScrollView}>
      <View style={styles.drawerHeader}>
        <Ionicons name="settings" size={48} color={COLORS.primary} />
        <Text style={styles.drawerHeaderText}>Admin Portal</Text>
      </View>
      
      <Text style={styles.drawerSectionTitle}>MAIN MENU</Text>
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="grid-outline" color={color} size={size} />}
        label="Dashboard" 
        onPress={() => props.navigation.navigate('Incident Dashboard')} 
      />
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="document-text-outline" color={color} size={size} />}
        label="Your Incident Reports" 
        onPress={() => props.navigation.navigate('Your Incident Reports')} 
      />
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="megaphone-outline" color={color} size={size} />}
        label="Post Update" 
        onPress={() => props.navigation.navigate('Incident Remarks')} 
      />
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="bar-chart-outline" color={color} size={size} />}
        label="Graphs & Statistics" 
        onPress={() => props.navigation.navigate('Dashboard & Analytics')} 
      />

      <View style={styles.drawerDivider}>
        <Text style={styles.drawerSectionTitle}>USER MANAGEMENT</Text>
        <DrawerItem 
          icon={({color, size}) => <Ionicons name="people-outline" color={color} size={size} />}
          label="Manage Users" 
          onPress={() => props.navigation.navigate('Manage Users')} 
        />
        <DrawerItem 
          icon={({color, size}) => <Ionicons name="person-add-outline" color={color} size={size} />}
          label="New User Requests" 
          onPress={() => props.navigation.navigate('Pending User Validation')} 
        />
        <DrawerItem 
          icon={({color, size}) => <Ionicons name="swap-vertical-outline" color={color} size={size} />}
          label="Request Role Change" 
          onPress={() => props.navigation.navigate('Request Role Change')} 
        />
      </View>

      <View style={styles.drawerDivider}>
        <Text style={styles.drawerSectionTitle}>SYSTEM CONFIG</Text>
        <DrawerItem 
          icon={({color, size}) => <Ionicons name="business-outline" color={color} size={size} />}
          label="Manage Stations" 
          onPress={() => props.navigation.navigate('Manage Stations')} 
        />
      </View>
    </DrawerContentScrollView>
  );
}


// Admin Drawer
function DrawerNavigator1() {
  return (
    <Drawer.Navigator 
      initialRouteName="Incident Dashboard" 
      screenOptions={{ 
        drawerActiveTintColor: COLORS.primary,
        headerShown: false
      }}
      drawerContent={(props) => <CustomAdminDrawerContent {...props} />}
      
    >
      <Drawer.Screen name="Incident Dashboard" component={HomeTabs4} 
      options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Incident Dashboard" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Incident Dashboard" type="header" />
        )
      })} />
      <Drawer.Screen name="Your Incident Reports" component={HomeTabs7} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Your Incident Reports" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Your Incident Reports" type="header" />
        )
      })} />
      <Drawer.Screen name="Incident Remarks" component={HomeTabs10} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Post Update" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Post Update" type="header" />
        )
      })} />
      <Drawer.Screen name="Dashboard & Analytics" component={HomeTabs3} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Graphs & Statistics" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Graphs & Statistics" type="header" />
        )
      })} />
      <Drawer.Screen name="Manage Users" component={HomeTabs5} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Manage Users" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Manage Users" type="header" />
        )
      })} />
      <Drawer.Screen name="Request Role Change" component={HomeTabs8} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Request Role Change" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Request Role Change " type="header" />
        )
      })} />
      <Drawer.Screen name="Pending User Validation" component={HomeTabs9}
       options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Pending User Validation" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Pending User Validation" type="header" />
        )
      })} />
      <Drawer.Screen name="Manage Stations" component={HomeTabs1} options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Manage Stations" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Manage Stations" type="header" />
        )
      })} />
      
    </Drawer.Navigator>
  );
}
// Responder Drawer Content
function CustomResponderDrawerContent(props) {
  const { authData } = useContext(AuthContext);
  return (
    <DrawerContentScrollView {...props} style={styles.drawerScrollView}>
      <View style={styles.drawerHeader}>
        <Ionicons name="shield-checkmark" size={48} color={COLORS.primary} />
        <Text style={styles.drawerHeaderText}>Responder Portal</Text>
      </View>
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="grid-outline" color={color} size={size} />}
        label="Dashboard" 
        onPress={() => props.navigation.navigate('Incident Dashboard')} 
      />
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="bar-chart-outline" color={color} size={size} />}
        label="Graphs & Statistics" 
        onPress={() => props.navigation.navigate('Dashboard & Analytics')} 
      />
      <DrawerItem 
        icon={({color, size}) => <Ionicons name="document-text-outline" color={color} size={size} />}
        label="Your Reports" 
        onPress={() => props.navigation.navigate('Your Incident Reports')} 
      />
      {authData?.role === 'responder_head' && (
        <View style={styles.drawerDivider}>
          <Text style={styles.drawerSectionTitle}>HEAD CONTROLS</Text>
          <DrawerItem 
            icon={({color, size}) => <Ionicons name="swap-vertical-outline" color={color} size={size} />}
            label="Request Role Change" 
            onPress={() => props.navigation.navigate('Request Role Change')} 
          />
          <DrawerItem 
            icon={({color, size}) => <Ionicons name="people-outline" color={color} size={size} />}
            label="Manage users" 
            onPress={() => props.navigation.navigate('Manage Users')} 
          />
        </View>
      )}
    </DrawerContentScrollView>
  );
}

function DrawerNavigator2() {
  return (
    <Drawer.Navigator
      initialRouteName="Incident Dashboard"

      screenOptions={{ drawerActiveTintColor: COLORS.primary ,  }}
      drawerContent={(props) => <CustomResponderDrawerContent {...props} />}
    >
      <Drawer.Screen 
        name="Incident Dashboard" 
        component={HomeTabs6} 
        options={({ route }) => ({
          ...hideHeaderOnTabs({ route }),
          drawerLabel: ({ color, focused }) => (
            <NetworkAwareLabel text="Incident Dashboard" type="drawer" color={color} focused={focused} />
          ),
          headerTitle: () => (
            <NetworkAwareLabel text="Incident Dashboard" type="header" />
          )
        })}
      />
      <Drawer.Screen name="Dashboard & Analytics" component={HomeTabs3}
      options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Dashboard & Analytics" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Dashboard & Analytics" type="header" />
        )
      })} />
      <Drawer.Screen name="Your Incident Reports" component={HomeTabs7}
       options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Your Incident Reports" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Your Incident Reports" type="header" />
        )
      })} />
      <Drawer.Screen name="Request Role Change" component={HomeTabs8}
       options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Request Role Change" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Request Role Change" type="header" />
        )
      })} />
      <Drawer.Screen name="Manage Users" component={HomeTabs5}
       options={({ route }) => ({
        ...hideHeaderOnTabs({ route }),
        drawerLabel: ({ color, focused }) => (
          <NetworkAwareLabel text="Manage Users" type="drawer" color={color} focused={focused} />
        ),
        headerTitle: () => (
          <NetworkAwareLabel text="Manage Users" type="header" />
        )
      })} />
    </Drawer.Navigator>
  );
}

// --- 🚀 ROOT NAVIGATION & LOGIC ---

const commonScreens = (
  <>
    <Stack.Screen name="Login" component={Login} />
    <Stack.Screen name="StationModal" component={StationScreen} />
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Initializing Secure Connection...</Text>
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
        
        // If a token exists, the user is logged in: sync data to Android
        if (authData?.token) {
          const dataToSave = {
            userId: String(authData.id),
            isHead: String(authData.is_head),
            role: String(authData.role || ""),
            stationId: String(authData.station_id || authData.stationId || ""),
            status: String(authData.status || ""),
            token: String(authData.token)
          };
          console.log("AppInitializer: saving auth data to native prefs", dataToSave);
          await SharedPrefModule.saveData(dataToSave);
          console.log("AppInitializer: native auth handoff completed");
        } else {
          console.log("AppInitializer: clearing native auth data");
          await SharedPrefModule.clearDataAndStopService();
        }
      } catch (error) {
        console.error(`Native Handoff Failure: ${error?.message || error}`);
      }
    };
    
    manageNativeService();
  }, [authData]); // This re-runs every time authData changes (like on login/logout)

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
    <View style={styles.itemRow} key={type}>
      <View style={[styles.iconBadge, { backgroundColor: isGranted ? COLORS.successLight : COLORS.primaryLight }]}>
        <Ionicons 
          name={isGranted ? "checkmark-circle" : "alert-circle"} 
          size={24} 
          color={isGranted ? COLORS.success : COLORS.primary} 
        />
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{label}</Text>
        <Text style={styles.itemDesc}>{description}</Text>
      </View>
      {!isGranted && (
        <TouchableOpacity 
          style={styles.fixBtnSmall} 
          onPress={() => onFix(type)}
          activeOpacity={0.7}
        >
          <Text style={styles.fixBtnText}>FIX</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const canSkip = health.runtimeGranted; 

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderIcon}>
               <Ionicons name="pulse" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.modalTitle}>System Diagnostics</Text>
            <Text style={styles.modalSubtitle}>
              {health.isRobust ? "All systems are green and ready." : "Action required to ensure reliability."}
            </Text>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {renderItem("Essential Permissions", health.runtimeGranted, "runtime", "Camera, Mic, Location, & Notifications")}
            {renderItem("Background Launch", health.overlayGranted, "overlay", "Allows alerts to appear over other apps")}
            {renderItem("Battery Unrestricted", health.batteryGranted, "battery", "Prevents the system from closing the app")}
            
            {health.hiddenRisks?.isHighRiskDevice && (
              renderItem(
                "Auto-Start / Boot", 
                health.hiddenRisks.manualCheckRequired 
                  ? (health.hiddenRisks.userIgnoredAutostart ? true : false) 
                  : health.hiddenRisks.miuiAutoStartGranted, 
                "autostart", 
                "Ensures app restarts after phone reboot"
              )
            )}

            {renderItem("Do Not Disturb Access", health.dndGranted, "dnd", "Alerts bypass silent mode")}

            {Platform.Version >= 34 && renderItem(
              "Full Screen Alerts", health.fsiGranted, "fsi", "Required for Lock Screen popups (Android 14+)"
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            {canSkip ? (
               <TouchableOpacity 
                 style={[styles.continueBtn, health.isRobust && styles.continueBtnSuccess]} 
                 onPress={onClose}
                 activeOpacity={0.8}
               >
                 <Text style={styles.continueBtnText}>
                    {health.isRobust ? "Continue to App" : "I'll Fix These Later"}
                 </Text>
               </TouchableOpacity>
            ) : (
              <View style={styles.blockedContainer}>
                <Ionicons name="lock-closed" size={16} color={COLORS.primary} style={{marginRight: 6}} />
                <Text style={styles.blockedText}>Essential permissions are required.</Text>
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

  const performSystemCheck = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const lang = await EncryptedStorage.getItem('userLanguage');
      if (lang && global.i18n) global.i18n.changeLanguage(lang);

      const health = await PermissionService.checkHealth();
      const ignoredAutostart = await EncryptedStorage.getItem('ignore_autostart_alert');
      
      if (health && health.hiddenRisks) {
         health.hiddenRisks.userIgnoredAutostart = (ignoredAutostart === 'true');
      }

      setHealthReport(health);

      const isAutoStartIssue = health.hiddenRisks?.isHighRiskDevice 
                               && !health.hiddenRisks?.miuiAutoStartGranted 
                               && !health.hiddenRisks?.userIgnoredAutostart;
      
      if (!health.isRobust || isAutoStartIssue) {
          setShowDashboard(true);
      } else {
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
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        performSystemCheck(true); 
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

  const handleFix = async (type) => {
    if (type === 'autostart' && healthReport?.hiddenRisks?.manualCheckRequired) {
        Alert.alert(
            "Enable Background Permissions",
            "We will take you to settings. Depending on your device, please look for and enable 'Auto-Start', 'Allow Background Activity', or add this app to 'Never Sleeping Apps'.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Go to Settings", 
                    onPress: async () => {
                        await PermissionService.fixPermission('autostart');
                        setTimeout(() => {
                             Alert.alert(
                                 "Did you enable it?",
                                 "We cannot verify this specific setting automatically due to manufacturer restrictions.",
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
    await PermissionService.fixPermission(type);
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

// --- 💅 BEAUTIFIED STYLESHEET ---
const styles = StyleSheet.create({
  // Loading Screen
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: COLORS.background 
  },
  loadingText: { 
    marginTop: 15, 
    fontSize: 14, 
    color: COLORS.textLight, 
    fontWeight: '500' 
  },

  // Custom Drawer Styling
  drawerScrollView: {
    backgroundColor: COLORS.card,
  },
  drawerHeader: {
    padding: 20,
    marginTop: 30,
    marginBottom: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  drawerHeaderText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  drawerDivider: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 15,
  },
  drawerSectionTitle: {
    marginLeft: 20,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textLight,
    letterSpacing: 1.2,
  },

  // Modal Health Dashboard
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(29, 53, 87, 0.7)', // Sleek dark blue overlay
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20 
  },
  modalContainer: { 
    width: '100%', 
    maxHeight: '85%', 
    backgroundColor: COLORS.card, 
    borderRadius: 24, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: { 
    padding: 25, 
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1, 
    borderBottomColor: '#F0F0F0' 
  },
  modalHeaderIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: { 
    fontSize: 22, 
    fontWeight: '800', 
    color: COLORS.textDark 
  },
  modalSubtitle: { 
    fontSize: 14, 
    color: COLORS.textLight, 
    marginTop: 6,
    textAlign: 'center' 
  },
  modalBody: { 
    padding: 25, 
  },
  itemRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  iconBadge: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 15 
  },
  itemContent: { 
    flex: 1 
  },
  itemTitle: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: COLORS.textDark,
    marginBottom: 3,
  },
  itemDesc: { 
    fontSize: 12, 
    color: COLORS.textLight,
    lineHeight: 16,
  },
  fixBtnSmall: { 
    backgroundColor: COLORS.primary, 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  fixBtnText: { 
    color: '#FFFFFF', 
    fontSize: 12, 
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalFooter: { 
    padding: 20, 
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1, 
    borderTopColor: '#F0F0F0' 
  },
  continueBtn: { 
    backgroundColor: COLORS.textDark, 
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center' 
  },
  continueBtnSuccess: {
    backgroundColor: COLORS.success,
  },
  continueBtnText: { 
    color: '#FFFFFF', 
    fontSize: 16, 
    fontWeight: '700' 
  },
  blockedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  blockedText: { 
    color: COLORS.primary, 
    fontSize: 14,
    fontWeight: '600',
  }
});