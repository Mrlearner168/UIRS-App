import { SERVER_URL } from '@env';
import axios from 'axios';
import { createContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import EncryptedStorage from 'react-native-encrypted-storage';
import { fetchStationMap } from '../context/IncidentStationMapContext';

export const AuthContext = createContext();

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

  // Load session on app start
  useEffect(() => {
    const loadSession = async () => {
      try {
        const token = await EncryptedStorage.getItem('token');
        const refreshToken = await EncryptedStorage.getItem('refresh_token');
        const idStr = await EncryptedStorage.getItem('id');
        const role = await EncryptedStorage.getItem('role');
        const status = await EncryptedStorage.getItem('status');
        const is_headStr = (await EncryptedStorage.getItem('is_head')) === 'true';
        const stationIdStr = await EncryptedStorage.getItem('station_id');
      
        const id = idStr ? Number(idStr) : null;
        const stationId = stationIdStr ? Number(stationIdStr) : null;
      
        if (refreshToken) {
          await refreshAccessToken(refreshToken, false);
        } else if (token && id && role && status && stationId !== null) {
          setAuthData({ token, id, role, status, stationId, is_head: is_headStr });
        
          // Fetch the map immediately after restoring session
          try {
            await fetchStationMap(token);
            console.log('Stations fetched and cached successfully after session restore.');
          } catch (error) {
            console.log('Error fetching station map after session restore:', error);
          }
        
          // Start periodic refresh every 150 seconds
          const interval = setInterval(() => fetchStationMap(token), 150000);
          console.log('Station map auto-refresh started after session restore.');
          setMapInterval(interval); // optional: store interval for cleanup
        }
      } catch (error) {
        console.log('Session load error:', error);
      } finally {
        setLoading(false);
      }
    };
  
    loadSession();
  }, []);
  
  // Login: save tokens and user info
  const login = async (token, refreshToken, id, role, status, station_id, is_head) => {
    try {
      await EncryptedStorage.setItem('token', String(token));
      await EncryptedStorage.setItem('refresh_token', String(refreshToken));
      await EncryptedStorage.setItem('id', String(id));
      await EncryptedStorage.setItem('role', String(role));
      await EncryptedStorage.setItem('status', String(status));
      await EncryptedStorage.setItem('station_id', String(station_id));
      await EncryptedStorage.setItem('is_head', String(is_head));

      setAuthData({
        token,
        id: Number(id),
        role,
        status,
        stationId: Number(station_id),
        is_head,
      });

      // Fetch once immediately
      await fetchStationMap(token);
      console.log('Stations fetched and cached successfully after login.');

      // Start periodic refresh every 150 seconds
      const interval = setInterval(() => fetchStationMap(token), 150000);
      console.log('Station map auto-refresh started.');

      // Optional: store interval ID if you need to clear it on logout
      setMapInterval(interval);

    } catch (error) {
      console.log('Login storage error:', error);
    }
  };

  // Logout: revoke token and clear storage
  const logout = async () => {
    try {
      const refreshToken = await EncryptedStorage.getItem('refresh_token');
      if (refreshToken) {
        await axios.post(`${SERVER_URL}/auth/logout`, { refresh_token: refreshToken });
      }
    
      // Clear all EncryptedStorage data
      await EncryptedStorage.clear();
    
      // Reset context state
      setAuthData({
        token: null,
        id: null,
        role: null,
        status: null,
        stationId: null,
        is_head: null,
      });
    
      // Optional: Clear cached incident_station_map
      try {
        await EncryptedStorage.removeItem('incident_station_map');
        console.log('Cleared station map cache.');
      } catch (err) {
        console.log('Error clearing station map cache:', err);
      }
    
    } catch (error) {
      console.log('Logout error:', error);
    }
  };
  
  // Refresh access token
  const refreshAccessToken = async (refreshToken, setLoad = true) => {
    try {
      const response = await axios.post(`${SERVER_URL}/auth/refresh`, { refresh_token: refreshToken });
      if (response.data.token) {
        const idStr = await EncryptedStorage.getItem('id');
        const role = await EncryptedStorage.getItem('role');
        const status = await EncryptedStorage.getItem('status');
        const stationIdStr = await EncryptedStorage.getItem('station_id');
        const is_headStr = await EncryptedStorage.getItem('is_head');

        await EncryptedStorage.setItem('token', String(response.data.token));

        setAuthData({
          token: response.data.token,
          id: idStr ? Number(idStr) : null,
          role: role || null,
          status: status || null,
          stationId: stationIdStr ? Number(stationIdStr) : null,
          is_head: is_headStr === 'true',
        });
      }
    } catch (error) {
      console.log('Refresh token error:', error);
      logout();
    } finally {
      if (setLoad) setLoading(false);
    }
  };
  // Verify role with server
  const verifyRole = async () => {
    if (!authData.token) return;
    try {
      const response = await axios.get(`${SERVER_URL}/auth/verify-role`, {
        headers: { Authorization: `Bearer ${authData.token}` },
      });

      const serverRole = response.data.role;
      if (serverRole !== authData.role) {
        logout(); // auto logout if role changed
      }
    } catch (error) {
      console.log('Role verification error:', error);
      //logout(); // safe fallback
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

  // Also verify on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        verifyRole();
      }
    });

    return () => subscription.remove();
  }, [authData.token, authData.role]);

  return (
    <AuthContext.Provider value={{ authData, login, logout, refreshAccessToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
