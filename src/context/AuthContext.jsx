import { SERVER_URL } from '@env';
import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import { createContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import { fetchStationMap } from '../context/IncidentStationMapContext';

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: 5000, // 5 second timeout for faster failure detection
});

export const AuthContext = createContext();

// Offline detection utility
const isNetworkAvailable = async () => {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable !== false;
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }) => {
  const [authData, setAuthData] = useState({
    token: null,
    id: null,
    role: null,
    status: null,
    stationId: null,
    is_head: null,
  });

  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const syncPendingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  // Monitor network connectivity
  useEffect(() => {
    const subscription = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(online);
      
      // If we're back online and sync is pending, trigger it
      if (online && syncPendingRef.current) {
        syncPendingRef.current = false;
        syncDataInBackground();
      }
    });

    return () => subscription?.();
  }, []);

  // Sync data in background when connection restores
  const syncDataInBackground = async () => {
    try {
      const token = await EncryptedStorage.getItem('token');
      const refreshToken = await EncryptedStorage.getItem('refresh_token');

      if (refreshToken && isOnline) {
        await refreshAccessToken(refreshToken, false);
      }
      
      if (token && isOnline) {
        await fetchStationMap(token).catch(e => console.log("Bg sync error:", e));
      }
    } catch (error) {
      console.log('Sync error:', error);
    }
  };

  // Load session on app start
  useEffect(() => {
    const loadSession = async () => {
      try {
        // 1. Parallel fetching from storage (instant)
        const [token, refreshToken, idStr, role, status, is_headStr, stationIdStr] = await Promise.all([
          EncryptedStorage.getItem('token'),
          EncryptedStorage.getItem('refresh_token'),
          EncryptedStorage.getItem('id'),
          EncryptedStorage.getItem('role'),
          EncryptedStorage.getItem('status'),
          EncryptedStorage.getItem('is_head'),
          EncryptedStorage.getItem('station_id'),
        ]);

        // 2. If we have a token, set it IMMEDIATELY to unlock the UI
        if (token) {
          setAuthData({
            token,
            id: idStr ? Number(idStr) : null,
            role,
            status,
            stationId: stationIdStr ? Number(stationIdStr) : null,
            is_head: is_headStr === 'true',
          });

          // 3. Check network availability BEFORE making network calls
          const online = await isNetworkAvailable();
          
          if (online) {
            // Network available: trigger background sync
            if (refreshToken) {
              refreshAccessToken(refreshToken, false).catch(e => console.log("Bg refresh error", e));
            }
            
            fetchStationMap(token).catch(e => console.log("Bg fetch error", e));
          } else {
            // Offline: load station map from cache
            try {
              const cachedStations = await EncryptedStorage.getItem('cached_stations');
              if (cachedStations) {
                console.log('Loaded station map from offline cache');
              }
              // Mark sync as pending for when online
              syncPendingRef.current = true;
            } catch (e) {
              console.log('Cache load error:', e);
            }
          }
        }

      } catch (error) {
        console.log('Session load error:', error);
      } finally {
        // 4. Always hide loading spinner as fast as possible
        setLoading(false); 
      }
    };

    loadSession();
  }, []);
  // Login: save tokens and user info
  const login = async (token, refreshToken, id, role, status, station_id, is_head) => {
    try {
      // 1. Save to encrypted storage in parallel (faster)
      await Promise.all([
        EncryptedStorage.setItem('token', String(token)),
        EncryptedStorage.setItem('refresh_token', String(refreshToken)),
        EncryptedStorage.setItem('id', String(id)),
        EncryptedStorage.setItem('role', String(role)),
        EncryptedStorage.setItem('status', String(status)),
        EncryptedStorage.setItem('station_id', String(station_id)),
        EncryptedStorage.setItem('is_head', String(is_head)),
      ]);

      setAuthData({
        token,
        id: Number(id),
        role,
        status,
        stationId: Number(station_id),
        is_head,
      });

      // 2. Fetch station map with network check
      if (isOnline) {
        try {
          const response = await axiosInstance.get(`${SERVER_URL}/stations`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          // Cache the station map for offline use
          if (response.data) {
            await EncryptedStorage.setItem('cached_stations', JSON.stringify(response.data));
            console.log('Stations fetched and cached successfully after login.');
          }
        } catch (error) {
          console.log('Failed to fetch stations:', error.message);
          // Continue anyway - cached data or offline mode will handle it
        }
      } else {
        console.log('Offline mode: skipping station fetch');
      }

    } catch (error) {
      console.log('Login storage error:', error);
    }
  };

  // Logout: revoke token and clear storage
  const logout = async () => {
    try {
      // 1. Get the token before clearing storage
      const refreshToken = await EncryptedStorage.getItem('refresh_token');

      // 2. Only fire server request if online (with timeout)
      if (refreshToken && isOnline) {
        axiosInstance.post(`${SERVER_URL}/auth/logout`, { refresh_token: refreshToken })
          .catch(err => console.log("Server logout failed, but clearing local session anyway.", err));
      }
    
      // 3. Clear ALL local data immediately
      await EncryptedStorage.clear();
    
      // 4. Reset state to navigate the user back to the Login screen instantly
      setAuthData({
        token: null,
        id: null,
        role: null,
        status: null,
        stationId: null,
        is_head: null,
      });

      syncPendingRef.current = false;
      console.log('User logged out and storage cleared.');
    
    } catch (error) {
      console.log('Logout error:', error);
      setAuthData({ token: null, id: null, role: null, status: null, stationId: null, is_head: null });
    }
  };
  
  // Refresh access token - Optimized with timeout and offline support
  const refreshAccessToken = async (refreshToken, setLoad = true) => {
    try {
      // Skip network call if offline
      if (!isOnline) {
        console.log('Offline: skipping token refresh');
        syncPendingRef.current = true;
        if (setLoad) setLoading(false);
        return;
      }

      const response = await axiosInstance.post(`${SERVER_URL}/auth/refresh`, { refresh_token: refreshToken });
      
      if (response.data.token) {
        const newToken = response.data.token;

        // Only write the NEW token to storage
        await EncryptedStorage.setItem('token', String(newToken));

        // Use functional update to keep existing data
        setAuthData(prev => ({
          ...prev,
          token: newToken,
        }));

        console.log('Access token refreshed successfully.');
      }
    } catch (error) {
      console.log('Refresh token error:', error.message);
      // Mark for sync when online
      syncPendingRef.current = true;
      // Only logout on specific errors, not network timeouts
      if (error.response?.status === 401) {
        logout();
      }
    } finally {
      if (setLoad) setLoading(false);
    }
  };

  // Verify role with server - with offline support
  const verifyRole = async () => {
    if (!authData.token || !isOnline) return;
    
    try {
      const response = await axiosInstance.get(`${SERVER_URL}/auth/verify-role`, {
        headers: { Authorization: `Bearer ${authData.token}` },
      });

      const serverRole = response.data.role;
      if (serverRole !== authData.role) {
        logout(); // auto logout if role changed
      }
    } catch (error) {
      if (error.response?.status === 401) {
        logout(); // Unauthorized
      }
      // Network errors are silently ignored for role verification
      console.log('Role verification skipped.', error.message);
    }
  };

  // Periodically verify role
  useEffect(() => {
    if (!authData.token) return;

    const interval = setInterval(() => {
      verifyRole();
    }, 30000); // every 30s

    return () => clearInterval(interval);
  }, [authData.token, authData.role]);

  // Also verify on app foreground and sync if needed
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        // Sync pending data and verify role
        if (syncPendingRef.current && isOnline) {
          syncDataInBackground();
        }
        verifyRole();
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [authData.token, authData.role, isOnline]);

  return (
    <AuthContext.Provider value={{ authData, login, logout, refreshAccessToken, loading, isOnline }}>
      {children}
    </AuthContext.Provider>
  );
};
