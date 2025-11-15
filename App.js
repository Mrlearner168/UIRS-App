import { Ionicons } from '@expo/vector-icons';
import notifee from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { getFocusedRouteNameFromRoute, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import MapboxGL from '@rnmapbox/maps';
import { useContext, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootSiblingParent } from 'react-native-root-siblings';
import i18n from '../UIRS-V4/src/translation/i18n';

import { MAPBOX_TOKEN } from "@env";
import { useNavigation } from "@react-navigation/native";
import { AuthContext, AuthProvider } from './src/context/AuthContext';
import { IncidentStationMapProvider } from './src/context/IncidentStationMapContext';
import { SocketProvider } from './src/context/SocketContext';
import { ToastProvider } from './src/context/ToastContext';
import { useFCMToken } from './src/hook/useFCMToken';
import { useGlobalIncidentListener } from './src/hook/useGlobalIncidentListener';
MapboxGL.setAccessToken(MAPBOX_TOKEN);

import { useEffect } from "react";
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

function AppInitializer() {
  // listener mounts once
  useGlobalIncidentListener();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootNavigator />
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
            iconName = "refresh"; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
            iconName = 'refresh'; // or "reload" / "sync" depending on preference
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
function RootNavigator() {
  const { authData, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!authData.token ? (  // check token, not authData
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
export default function App() {
  const fcmToken = useFCMToken();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLanguage = async () => {
      const lang = await EncryptedStorage.getItem('userLanguage');
      if (lang) i18n.changeLanguage(lang); // change only if exists
      setLoading(false);
    };
    loadLanguage();
  }, []);
  
  useEffect(() => {
    async function setupChannel() {
      await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
      });
    }
    setupChannel();
  }, []);
  
  //fcm token logging
  console.log('Token of FCM:', fcmToken);
  
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('FCM foreground second:', remoteMessage);

      // Show system tray notification while in foreground
      await notifee.displayNotification({
        title: remoteMessage.notification?.title || 'UIRS',
        body: remoteMessage.notification?.body || 'New message',
        android: {
          channelId: 'default',
          pressAction: { id: 'default' },
        },
      });

      // Or use Alert if you prefer popup
      // Alert.alert(remoteMessage.notification?.title, remoteMessage.notification?.body);
    });

    return unsubscribe;
  }, []);

  function MainApp() {
    const fcmToken = useFCMToken(); // hook runs only if logged in
    console.log('FCM token:', fcmToken);
  }

  return (
    <RootSiblingParent>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <IncidentStationMapProvider>
            <SocketProvider>
              <ToastProvider>
                <RootSiblingParent>
                  <AppInitializer />
                  <MainApp />
                </RootSiblingParent>
              </ToastProvider>
            </SocketProvider>
          </IncidentStationMapProvider>
        </AuthProvider>
      </I18nextProvider>
    </RootSiblingParent>
  );
}
